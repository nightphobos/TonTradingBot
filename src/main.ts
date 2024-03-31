import dotenv from 'dotenv';
dotenv.config();

import { bot } from './bot';
import { walletMenuCallbacks } from './connect-wallet-menu';
import {
    handleConnectCommand,
    handleDisconnectCommand,
    handleSendTXCommand,
    handleShowMyWalletCommand,
    handleStartCommand
} from './commands-handlers';
import { initRedisClient } from './ton-connect/storage';
import TonWeb from 'tonweb';
import { Pool, connect, getPoolWithCaption, getUserByTelegramID, updateUserState } from './ton-connect/mongo';
import { commandCallback } from './commands-handlers';
import TelegramBot from 'node-telegram-bot-api';
import { getPair } from './dedust/api';
const nacl = TonWeb.utils.nacl;
let tonWeb = new TonWeb();
(async() => await getPair())();
setInterval(getPair,60000);
async function main(): Promise<void> {
    await initRedisClient();
    await connect();
    const callbacks = {
        ...walletMenuCallbacks,
        ...commandCallback
    };

    bot.on('callback_query', async query => {
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
        console.log(query.data, ':46');
        //jetton click processing 
        if(query.data.indexOf('symbol-') + 1){
            console.log(query.data, ':49');
            const clickedSymbol = query.data.replace('symbol-','');
            let user = await getUserByTelegramID(query.from.id);
            //check user state is trade
            if( user!.state.state == 'trading' ){

                user!.state.state = 'selectPair';
                let selectedPool = await getPoolWithCaption(clickedSymbol.split('/'));
                user!.state.jettons = clickedSymbol.split('/');
                user!.state.mainCoin = selectedPool!.main;

                await bot.editMessageText( `Do you want to buy/sell?`,{
                    message_id: query.message?.message_id,
                    chat_id: query.message?.chat.id
                });
                await bot.editMessageReplyMarkup(
                    {
                        inline_keyboard: [[
                            {text: 'Buy', callback_data: `symbol-buy`},
                            {text: 'Sell', callback_data: `symbol-sell`}
                        ]] 
                    },
                    {
                        message_id: query.message?.message_id,
                        chat_id: query.message?.chat.id
                    }
                );
            }else if ( user!.state.state == 'selectPair' ){
                let selectedPool = await getPoolWithCaption(user!.state.jettons);
                let state = user!.state;

                state.state = 'isBuy';

                if(clickedSymbol == 'buy') state.isBuy = true 
                else state.isBuy = false;

                const price = selectedPool?.prices[1-state.mainCoin]! / selectedPool?.prices[state.mainCoin]!;
                bot.sendMessage( query.message!.chat.id,`Please input Ordering price\n 1 ${state.jettons[1-state.mainCoin]} ≈ ${price} ${state.jettons[state.mainCoin]}`);
            }
            // else{
            //     bot.sendMessage(query.from.id, "Please click <b>Start trading</b> from /start message to trade", {parse_mode: 'HTML'});
            // }
            updateUserState(query.from!.id, user!.state);
        }
        //other default button click processing 
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
    
    bot.on('text',async (msg: TelegramBot.Message) => {
        console.log(msg.text);
        let user = await getUserByTelegramID(msg.from!.id);
        if(user?.state.state == 'isBuy'){
            user.state.state = 'price';
            user.state.price = Number(msg.text);
            bot.sendMessage(msg.chat.id,'Please input amount to swap');
        }else if(user?.state.state == 'price'){
            let state = user.state;
            user.state.state = 'amount';
            user.state.amount = Number(msg.text);
            bot.sendMessage(msg.chat.id,
                `Please Review your new Order\nPool : ${state.jettons.join('/')}\nBuy/Sell : ${state.isBuy ? 'Buy' : 'Sell'}\nPrice : ${state.price}\nAmount : ${state.amount}`,
                {
                    reply_markup:{
                        inline_keyboard:[[
                            {text:'I agree', callback_data: JSON.stringify({ method: 'addNewOrder' })},
                            {text:'I don\'t agree', callback_data: JSON.stringify({ method: 'tradingCallback'})}
                ]]}});
            
        }else{
            return;
        }
        updateUserState(msg.from!.id, user!.state);
    })

    bot.onText(/\/connect/, handleConnectCommand);

    bot.onText(/\/deposit/, handleSendTXCommand);

    bot.onText(/\/disconnect/, handleDisconnectCommand);

    bot.onText(/\/my_wallet/, handleShowMyWalletCommand);

    bot.onText(/\/start/, handleStartCommand);
}

main(); 