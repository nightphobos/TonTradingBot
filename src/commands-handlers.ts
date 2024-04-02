import { CHAIN, isTelegramUrl, toUserFriendlyAddress, UserRejectsError } from '@tonconnect/sdk';
import { bot } from './bot';
import { getWallets, getWalletInfo } from './ton-connect/wallets';
import QRCode from 'qrcode';
import TelegramBot, { CallbackQuery, InlineKeyboardButton,Message } from 'node-telegram-bot-api';
import { getConnector } from './ton-connect/connector';
import { addTGReturnStrategy, buildUniversalKeyboard, pTimeout, pTimeoutException , replyMessage} from './utils';
import { addOrderingDataToUser, createUser, getPools, getPoolWithCaption, getUserByTelegramID, OrderingData, updateUserState,User } from './ton-connect/mongo';
import TonWeb from 'tonweb';
import nacl from 'tweetnacl';
import { fetchDataGet, Jetton, walletAsset } from './dedust/api';
let tonWeb = new TonWeb();

let newConnectRequestListenersMap = new Map<number, () => void>();

export const commandCallback = {
    tradingCallback:handleTradingCallback,
    addNewOrder:handleAddNewOrder
}

async function handleAddNewOrder(query: CallbackQuery){
    console.log(query);
    const user = await getUserByTelegramID(query.message?.chat!.id!);
    let newOrder: OrderingData = {
        amount: user?.state.amount!,
        jettons: user?.state.jettons!,
        mainCoin: user?.state.mainCoin!,
        isBuy: user?.state.isBuy!,
        price: user?.state.price!,
    };
    //check balance
    
    let mainId = 0, flag = false;
    const pool = await getPoolWithCaption(user?.state.jettons!);
    const walletBalance: walletAsset[] = await fetchDataGet(`/accounts/${user?.walletAddress}/assets`);
    
    
    walletBalance.map(async (walletasset) => {
        if(user?.state.isBuy) mainId =  user?.state.mainCoin;
        else mainId = 1 - user?.state.mainCoin!;
        const assets: Jetton[] = await fetchDataGet('/assets');
        assets.map((asset) => {
            //find wallet asset's symbol => asset.symbol
            if(asset.address == walletasset.address){
                //check if the symbol's balance is available
                if(asset.symbol == user?.state.jettons[mainId]){
                    flag = true;
                    if( walletasset.balance < BigInt(user?.state.amount * ( 10 ** pool?.decimals[mainId]!))){
                        bot.sendMessage(query.message!.chat.id,`Your ${user?.state.jettons[mainId]} balance is not enough!`);
                        flag = false;
                        return;
                    }
                }
            }
        })
    })
    console.log(walletBalance[0], BigInt(user?.state.amount! * ( 10 ** pool?.decimals[mainId]!)),pool?.decimals[mainId]! ,user?.state.amount! );
    console.log(user?.state,mainId);
    if(user?.state.jettons[mainId] == 'TON')
        if(walletBalance[0]?.balance! >= BigInt(user?.state.amount! * ( 10 ** pool?.decimals[mainId]!))) flag = true;
        else flag = false;
    if(flag){
        await addOrderingDataToUser(query.message?.chat!.id!, newOrder);
        bot.sendMessage(query.message!.chat.id,`New Order is Succesfuly booked, Press /start`);
    }
    else {
        bot.sendMessage(query.message!.chat.id,`New Order is failed due to invalid balance, Press /start`);
    }
    //new order added
}

async function handleTradingCallback (query: CallbackQuery){
    try {
        //update user state string
        
        let user = await getUserByTelegramID(query.message?.chat!.id!);
        user!.state.state = 'trading';
        updateUserState(query.message?.chat!.id!, user!.state);

        //fetch assets from dedust API
        const pools = await getPools();
        const rows = Math.ceil(pools!.length / 4);

        // let keyboardArray: InlineKeyboardButton[][] = []; // Type annotation for keyboardArray
        // const filteredAssets = pools!.filter(pool => pool !== undefined);
        // filteredAssets.map((pool, index) => {
        //     if (!!!keyboardArray[Math.floor(index / 4)]) keyboardArray[Math.floor(index / 4)] = [];
        //     const caption = pool.caption[0]! + '/' + pool.caption[1]!;
        //     keyboardArray[Math.floor(index / 4)]![index % 4] = {text: caption, callback_data: `symbol-${caption}`};
        // });
        // keyboardArray.push([{text:'<< Back', callback_data: 'newStart'}]);
        await bot.editMessageText(
            `🏃 Trading\n\nPlease type in Jetton's Name`,
            {
                message_id: query.message?.message_id,
                chat_id: query.message?.chat.id
            }
        )
        await bot.editMessageReplyMarkup(
            { inline_keyboard: [[{text:'<< Back', callback_data: 'newStart'}]] },
            {
                message_id: query.message?.message_id,
                chat_id: query.message?.chat.id
            }
        );
            
    } catch (error) {
        console.log(error)
    }
}

export async function handleStartCommand (msg: TelegramBot.Message)  {
    
    //update / create user info
    const userId = msg.chat?.id ?? 0;
    let prevUser = await getUserByTelegramID(userId);
    let telegramWalletAddress;
    let message;

    if (prevUser){
         message = 'Welcome Back! ' + msg.chat?.first_name;
         telegramWalletAddress = prevUser.walletAddress;
         //set userstate idle
         updateUserState(userId,{
            state: 'idle',
            jettons: ['',''],
            mainCoin: 0,
            amount: 0,
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
            telegramID: msg.chat!.id,
            walletAddress: address.toString(true,true,false),
            secretKey: keyPair.secretKey.toString(),
            publicKey: keyPair.publicKey.toString(),
            state:{
                state: 'idle',
                jettons: ['',''],
                mainCoin: 0,
                amount: 0,
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
        `🏆<b>RewardBot</b>🏆\n
👏Welcome to <b>RewardBot</b>.
<b>RewardBot</b> can provide you with a good trading environment <b>Anytime</b>, <b>Anywhere</b>, <b>Anyone</b> 

Please <b>Connect Wallet</b> to <b>Deposit</b> and <b>Start Trading</b>.
`,{
reply_markup:{
    inline_keyboard:[
        [{text:'💵 My wallet', callback_data:'showMyWallet'}],
        [{text:'♻️ Instant Swap', web_app:{url:'https://dedust.io/swap'}},{text:'🏃 Book Order',/*web_app:{url:'https://web.ton-rocket.com/trade'}*/ callback_data: JSON.stringify({
            method: 'tradingCallback'
        })}],
        [{text:'🔗 Connect Your Wallet',callback_data:'walletConnect'},{text:'✂ Disconnect Wallet', callback_data:'disConnect'}],
        //    [{text:'Deposit', callback_data:'my_wallet'},{text:'Withdraw', callback_data:'my_wallet'}],
        [{text:'📤 Deposit', callback_data:'deposit'},{text:'📥 Withdraw', callback_data:'withdraw'}],
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
            `🔗 Connect Wallet\n\nYou have already connect ${connectedName} wallet\nYour address: ${toUserFriendlyAddress(
                connector.wallet!.account.address,
                connector.wallet!.account.chain === CHAIN.MAINNET
            )}\n\n Disconnect wallet firstly to connect a new one`,{
                reply_markup: {
                    inline_keyboard: [
                        [{text:'<< Back', callback_data: 'newStart'}]
                    ]
                }
            }
        );

        return;
    }

    const unsubscribe = connector.onStatusChange(async wallet => {
        if (wallet) {
            await deleteMessage();

            const walletName =
                (await getWalletInfo(wallet.device.appName))?.name || wallet.device.appName;
            await bot.sendMessage(chatId, `🔗 Connect Wallet\n\n${walletName} wallet connected successfully`,{
                reply_markup: {
                    inline_keyboard: [
                        [{text:'<< Back', callback_data: 'newStart'}]
                    ]
                }
            });
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
            inline_keyboard: [
                keyboard,
                [{text:'<< Back', callback_data: 'newStart'}]
            ]
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
                inline_keyboard: [[{
                    text: `Open ${walletInfo?.name || connector.wallet!.device.appName}`,
                    url: deeplink
                }]]
            }
        }
    );
}

export async function handleDisconnectCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    const connector = getConnector(chatId);

    await connector.restoreConnection();
    if (!connector.connected) {
        await bot.sendMessage(chatId, "✂ Disconnect Wallet\n\nYou didn't connect a wallet",{
            reply_markup: {
                inline_keyboard: [
                    [{text:'<< Back', callback_data: 'newStart'}]
                ]
            }
        });
        return;
    }

    await connector.disconnect();

    await bot.sendMessage(chatId, '✂ Disconnect Wallet\n\nWallet has been disconnected',{
        reply_markup: {
            inline_keyboard: [
                [{text:'<< Back', callback_data: 'newStart'}]
            ]
        }
    });
}

export async function handleDepositCommand(query: CallbackQuery){
    const user = await getUserByTelegramID(query.message?.chat!.id!);

    replyMessage(query.message!, `📤 Deposit\n\nYour RewardBot Wallet Address is \n<code>${user?.walletAddress}</code>`,[[{text:'<< Back', callback_data: 'newStart'}]])
}

export async function handleWithdrawCommand(query: CallbackQuery){
    const user = await getUserByTelegramID(query.message?.chat!.id!);

    replyMessage(query.message!, `📤 Withdraw\n\nYour RewardBot Wallet Address is \n<code>${user?.walletAddress}</code>`,[[{text:'<< Back', callback_data: 'newStart'}]])
}

export async function handleShowMyWalletCommand(msg: TelegramBot.Message): Promise<void> {
    // const chatId = msg.chat.id;

    // const connector = getConnector(chatId);

    // await connector.restoreConnection();
    // if (!connector.connected) {
    //     await bot.sendMessage(chatId, "You didn't connect a wallet");
    //     return;
    // }

    // const walletName =
    //     (await getWalletInfo(connector.wallet!.device.appName))?.name ||
    //     connector.wallet!.device.appName;
    // const address = toUserFriendlyAddress(
    //     connector.wallet!.account.address,
    //     connector.wallet!.account.chain === CHAIN.MAINNET,
    // )
    console.log(msg);

    const user = await getUserByTelegramID(msg.chat!.id);

    const address = user?.walletAddress;
    const balances: walletAsset[] = await fetchDataGet(`/accounts/${address}/assets`);
    const assets: Jetton[] = await fetchDataGet('/assets');
    let outputStr = 'Toncoin : ' + (balances[0]?.balance ? (Number(balances[0]?.balance) / 1000000000) : '0') + ' TON\n';

    balances.map((walletAssetItem) => {
    
        const filteredAssets = assets.map((asset) => {
            if(walletAssetItem.asset.type != 'native')
                if(asset.address === walletAssetItem.asset.address){
                    outputStr += asset.name + ' : ' + (Number(walletAssetItem.balance) / 10 ** asset.decimals) + ' ' + asset.symbol + '\n';
                }
        });
    });
    
    replyMessage(msg,
        `💵 My wallet\n\nYour RewardBot Wallet address:\n <code>${address}</code>\n ${outputStr}`,
        [[{text:'<< Back', callback_data: 'newStart'}]]
    )
}
