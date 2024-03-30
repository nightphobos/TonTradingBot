import dotenv from 'dotenv';
dotenv.config();

import { bot } from './bot';
import { walletMenuCallbacks } from './connect-wallet-menu';
import { tradingMenuClick } from './trading-menus';
import {
    handleConnectCommand,
    handleDisconnectCommand,
    handleSendTXCommand,
    handleShowMyWalletCommand,
    handleTradeCommnad
} from './commands-handlers';
import { initRedisClient } from './ton-connect/storage';
import TelegramBot, { CallbackQuery } from 'node-telegram-bot-api';
import express from 'express';
import TonWeb from 'tonweb';
import { User, getUserByTelegramID, createUser, connect, updateUserState } from './ton-connect/mongo';
import { addTGReturnStrategy } from './utils';

declare global {
    interface Global {
        userMessage: string;
    }
}

const nacl = TonWeb.utils.nacl;
let tonWeb = new TonWeb();

async function main(): Promise<void> {
    await initRedisClient();
    await connect();
    const callbacks = {
        ...walletMenuCallbacks,
        ...tradingMenuClick,
    };

    bot.on('callback_query', query => {
        if (!query.data) {
            return;
        }
        switch (query.data) {
            case 'walletConnect':
                handleConnectCommand(query.message!);
                return;
            case 'myWallet':
                handleShowMyWalletCommand(query.message!);
                return;
            case 'disConnect':
                handleDisconnectCommand(query.message!);
                return;
            default:
                break;
        }
        
        let request: { method: string; data: string };
        
        try {
            request = JSON.parse(query.data);
        } catch {
            return;
        }

        if (!callbacks[request.method as keyof typeof callbacks]) {
            return;
        }

        callbacks[request.method as keyof typeof callbacks](query, request.data);
    });
    
    bot.on('message', async msg => {
        const userId = msg.from?.id ?? 0;
        const userState: User | null = await getUserByTelegramID(userId);
        if (userState?.state == 'waitForTraingToken') {
            updateUserState(userId, 'waitForChoosePair');
            (global as { userMessage?: string }).userMessage = msg.text;
        }
    });

    bot.onText(/\/trade/, handleTradeCommnad);

    bot.onText(/\/connect/, handleConnectCommand);

    bot.onText(/\/deposit/, handleSendTXCommand);

    bot.onText(/\/disconnect/, handleDisconnectCommand);

    bot.onText(/\/my_wallet/, handleShowMyWalletCommand);

    bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
        const userId = msg.from?.id ?? 0;
        let prevUser = await getUserByTelegramID(userId);
        let telegramWalletAddress;
        let message;

        if (prevUser){
             message = 'Welcome Back! ' + msg.from?.first_name;
             telegramWalletAddress = prevUser.walletAddress;
             //set userstate idle
             updateUserState(userId,'idle');
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
                state:"idle"
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
    });
}

main(); 