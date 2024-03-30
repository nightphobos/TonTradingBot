import { CHAIN, isTelegramUrl, toUserFriendlyAddress, UserRejectsError } from '@tonconnect/sdk';
import { bot } from './bot';
import { getWallets, getWalletInfo } from './ton-connect/wallets';
import QRCode from 'qrcode';
import TelegramBot from 'node-telegram-bot-api';
import { getConnector } from './ton-connect/connector';
import { addTGReturnStrategy, buildUniversalKeyboard, pTimeout, pTimeoutException } from './utils';
import { createUser, getUserByTelegramID, updateUserState,User } from './ton-connect/mongo';
import TonWeb from 'tonweb';
import nacl from 'tweetnacl';
let tonWeb = new TonWeb();

let newConnectRequestListenersMap = new Map<number, () => void>();

export async function handleStartCommand (msg: TelegramBot.Message)  {
    const userId = msg.from?.id ?? 0;
    let prevUser = await getUserByTelegramID(userId);
    let telegramWalletAddress;
    let message;

    if (prevUser){
         message = 'Welcome Back! ' + msg.from?.first_name;
         telegramWalletAddress = prevUser.walletAddress;
         //set userstate idle
         updateUserState(userId,{
            state: 'idle',
            fromJetton: '',
            toJetton: '',
            amount: '',
            price: 0,
            isBuy: false
        });
        }
    else {
        //create a new wallet
        const keyPair = nacl.sign.keyPair();
        let wallet = tonWeb.wallet.create({ publicKey: keyPair.publicKey, wc: 0 });
        const address = await wallet.getAddress();
        const seqno = await wallet.methods.seqno().call();
        const deploy = wallet.deploy(keyPair.secretKey);
        const deployFee = await deploy.estimateFee();
        const deploySended = await deploy.send();
        const deployQuery = await deploy.getQuery();
        //save in db
        let newUser: User = {
            telegramID: String(msg.from?.id),
            walletAddress: address.toString(true,true,false),
            secretKey: keyPair.secretKey.toString(),
            state:{
                state: 'idle',
                fromJetton: '',
                toJetton: '',
                amount: '',
                price: 0,
                isBuy: false
            }
        };
        await createUser(newUser);
        //save in variable to show
        telegramWalletAddress = address.toString(true,true,false);
    }
    bot.sendMessage(
        msg.chat.id,
        `🏆<b>RewardBot</b>🏆
👏Welcome to <b>RewardBot</b>.
<b>RewardBot</b> can provide you with a good trading environment <b>Anytime</b>, <b>Anywhere</b>, <b>Anyone</b> 

Your RewardBot Wallet Address is
<code>${telegramWalletAddress}</code>

Please Connect Wallet and Start Trading.
`,{
reply_markup:{
    inline_keyboard:[
        [{text:'Start Trading',web_app:{url:'https://web.ton-rocket.com/trade'}}],
        [{text:'Connect Wallet',callback_data:'walletConnect'}],
        [{text:'My wallet', callback_data:'myWallet'}],
    //    [{text:'Deposit', callback_data:'my_wallet'},{text:'Withdraw', callback_data:'my_wallet'}],
        [{text:'Disconnect Wallet', callback_data:'disConnect'}],
    ]
},
parse_mode:'HTML'
}
    );
}

export async function handleConnectCommand(msg: TelegramBot.Message): Promise<void> {
    console.log('connect!!');
    const chatId = msg.chat.id;
    let messageWasDeleted = false;

    newConnectRequestListenersMap.get(chatId)?.();

    const connector = getConnector(chatId, () => {
        unsubscribe();
        newConnectRequestListenersMap.delete(chatId);
        deleteMessage();
    });

    await connector.restoreConnection();
    if (connector.connected) {
        const connectedName =
            (await getWalletInfo(connector.wallet!.device.appName))?.name ||
            connector.wallet!.device.appName;
        await bot.sendMessage(
            chatId,
            `You have already connect ${connectedName} wallet\nYour address: ${toUserFriendlyAddress(
                connector.wallet!.account.address,
                connector.wallet!.account.chain === CHAIN.MAINNET
            )}\n\n Disconnect wallet firstly to connect a new one`
        );

        return;
    }

    const unsubscribe = connector.onStatusChange(async wallet => {
        if (wallet) {
            await deleteMessage();

            const walletName =
                (await getWalletInfo(wallet.device.appName))?.name || wallet.device.appName;
            await bot.sendMessage(chatId, `${walletName} wallet connected successfully`);
            unsubscribe();
            newConnectRequestListenersMap.delete(chatId);
        }
    });
    const wallets = await getWallets();

    const link = connector.connect(wallets);
    const image = await QRCode.toBuffer(link);

    const keyboard = await buildUniversalKeyboard(link, wallets);

    const botMessage = await bot.sendPhoto(chatId, image, {
        reply_markup: {
            inline_keyboard: [keyboard]
        }
    });

    const deleteMessage = async (): Promise<void> => {
        if (!messageWasDeleted) {
            messageWasDeleted = true;
            await bot.deleteMessage(chatId, botMessage.message_id);
        }
    };

    newConnectRequestListenersMap.set(chatId, async () => {
        unsubscribe();

        await deleteMessage();

        newConnectRequestListenersMap.delete(chatId);
    });
}


export async function handleSendTXCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    const connector = getConnector(chatId);

    await connector.restoreConnection();
    if (!connector.connected) {
        await bot.sendMessage(chatId, 'Connect wallet to deposit');
        return;
    }

    pTimeout(
        connector.sendTransaction({
            validUntil: Math.round(
                (Date.now() + Number(process.env.DELETE_SEND_TX_MESSAGE_TIMEOUT_MS)) / 1000
            ),
            messages: [
                { 
                    amount: '1000000',
                    address: '0:0000000000000000000000000000000000000000000000000000000000000000'
                }
            ]
        }),
        Number(process.env.DELETE_SEND_TX_MESSAGE_TIMEOUT_MS)
    )
        .then(() => {
            bot.sendMessage(chatId, `Transaction sent successfully`);
        })
        .catch(e => {
            if (e === pTimeoutException) {
                bot.sendMessage(chatId, `Transaction was not confirmed`);
                return;
            }

            if (e instanceof UserRejectsError) {
                bot.sendMessage(chatId, `You rejected the transaction`);
                return;
            }

            bot.sendMessage(chatId, `Unknown error happened`);
        })
        .finally(() => connector.pauseConnection());

    let deeplink = '';
    const walletInfo = await getWalletInfo(connector.wallet!.device.appName);
    if (walletInfo) {
        deeplink = walletInfo.universalLink;
    }

    if (isTelegramUrl(deeplink)) {
        const url = new URL(deeplink);
        url.searchParams.append('startattach', 'tonconnect');
        deeplink = addTGReturnStrategy(url.toString(), process.env.TELEGRAM_BOT_LINK!);
    }

    await bot.sendMessage(
        chatId,
        `Open ${walletInfo?.name || connector.wallet!.device.appName} and confirm transaction`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: `Open ${walletInfo?.name || connector.wallet!.device.appName}`,
                            url: deeplink
                        }
                    ]
                ]
            }
        }
    );
}

export async function handleDisconnectCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    const connector = getConnector(chatId);

    await connector.restoreConnection();
    if (!connector.connected) {
        await bot.sendMessage(chatId, "You didn't connect a wallet");
        return;
    }

    await connector.disconnect();

    await bot.sendMessage(chatId, 'Wallet has been disconnected');
}

export async function handleShowMyWalletCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    const connector = getConnector(chatId);

    await connector.restoreConnection();
    if (!connector.connected) {
        await bot.sendMessage(chatId, "You didn't connect a wallet");
        return;
    }

    const walletName =
        (await getWalletInfo(connector.wallet!.device.appName))?.name ||
        connector.wallet!.device.appName;

    await bot.sendMessage(
        chatId,
        `Connected wallet: ${walletName}\nYour address: ${toUserFriendlyAddress(
            connector.wallet!.account.address,
            connector.wallet!.account.chain === CHAIN.TESTNET
        )}`
    );
}
