import dotenv from 'dotenv';
dotenv.config();

import { bot } from './bot';
import { walletMenuCallbacks } from './connect-wallet-menu';
import {
    handleConnectCommand,
    handleDepositCommand,
    handleDisconnectCommand,
    handleSendTXCommand,
    handleShowMyWalletCommand,
    handleStartCommand,
    handleWithdrawCommand
} from './commands-handlers';
import { initRedisClient } from './ton-connect/storage';
import TonWeb from 'tonweb';
import { Pool, connect, getPoolWithCaption, getUserByTelegramID, updateUserState } from './ton-connect/mongo';
import { commandCallback } from './commands-handlers';
import TelegramBot, { CallbackQuery, InlineKeyboardButton, Message } from 'node-telegram-bot-api';
import { getPair } from './dedust/api';
import { dealOrder } from './dedust/dealOrder';
import { replyMessage } from './utils';
const nacl = TonWeb.utils.nacl;
let tonWeb = new TonWeb();

(async() => await getPair())();
setInterval(getPair,600000);
setTimeout( () => setInterval(dealOrder,1000),10000)


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
            case 'newStart':
                handleStartCommand(query.message!);
                return;
            case 'walletConnect':
                handleConnectCommand(query.message!);
                return;
            case 'showMyWallet':
                handleShowMyWalletCommand(query.message!);
                return;
            case 'disConnect':
                handleDisconnectCommand(query.message!);
                return;
            case 'deposit':
                handleDepositCommand(query);
                return;
            case 'withdraw':
                handleWithdrawCommand(query);
                return;
            default:
                break;
        }
        
        console.log(query.data, ':46');
        //jetton click processing 
        if(query.data.indexOf('symbol-') + 1){
            console.log(query.data, ':49');
            const clickedSymbol = query.data.replace( 'symbol-', '' );
            let user = await getUserByTelegramID(query.message?.chat!.id!);
            //check user state is trade
            if( user!.state.state == 'trading' ){

                user!.state.state = 'selectPair';
                let selectedPool = await getPoolWithCaption(clickedSymbol.split('/'));
                user!.state.jettons = clickedSymbol.split('/');
                user!.state.mainCoin = selectedPool!.main;
                await replyMessage(query.message!, `🏃 Trading\n\nDo you want to buy/sell?`, [[
                    {text: 'Buy', callback_data: `symbol-buy`},
                    {text: 'Sell', callback_data: `symbol-sell`}
                ],[
                    {text:'<< Back', callback_data: 'newStart'}
                ]] )
            }else if ( user!.state.state == 'selectPair' ){
                let selectedPool = await getPoolWithCaption(user!.state.jettons);
                let state = user!.state;

                state.state = 'isBuy';

                if(clickedSymbol == 'buy') state.isBuy = true 
                else state.isBuy = false;

                const price = selectedPool?.prices[1-state.mainCoin]! / selectedPool?.prices[state.mainCoin]!;
                
                await replyMessage(query.message!, 
                    `🏃 Trading\n\nPlease input amount of jetton in ` + state.jettons[state.mainCoin]/* 1 ${state.jettons[1-state.mainCoin]} ≈ ${price} ${state.jettons[state.mainCoin]}`*/,
                    [[ {text:'<< Back', callback_data: 'newStart'} ]]
                )
                
            }
            // else{
            //     bot.sendMessage(query.message?.chat!.id!, "Please click <b>Start trading</b> from /start message to trade", {parse_mode: 'HTML'});
            // }
            updateUserState(query.message?.chat!.id!, user!.state);
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
        
        console.log(msg);
        let user = await getUserByTelegramID(msg.chat!.id);
        if(user!)
        if( user!.state.state == 'trading' ){

            let clickedSymbol = 'TON/' + msg.text;
            let selectedPool = await getPoolWithCaption(clickedSymbol.split('/'));
            if(!selectedPool) {
                await bot.sendMessage(msg.chat.id,  `🏃 Trading\n\nPlease type in the valid Symbol`,
                {
                    reply_markup:{
                        inline_keyboard:[[
                            {text:'<< Back', callback_data: 'newStart'}
                        ]] 
                    }
                });
                return;
            }
            user!.state.state = 'selectPair';
            user!.state.jettons = clickedSymbol.split('/');
            user!.state.mainCoin = selectedPool!.main;
            
            await bot.sendMessage(msg.chat.id,  `🏃 Trading\n\nDo you want to buy/sell?`,
            {
                reply_markup:{
                    inline_keyboard:[[
                        {text: '🟢 Buy', callback_data: `symbol-buy`},
                        {text: '🔴 Sell', callback_data: `symbol-sell`}
                    ],[
                        {text:'<< Back', callback_data: 'newStart'}
                    ]] 
                }
            });
        }else if(user?.state.state == 'isBuy'){
            user.state.state = 'price';
            user.state.amount = Number(msg.text);
            
            await bot.sendMessage(msg.chat.id, '🏃 Trading\n\nPlease input limit price in ' + user.state.jettons[user.state.mainCoin],
            {
                reply_markup:{
                    inline_keyboard:[[ {text:'<< Back', callback_data: 'newStart'} ]]
                }
            });
        }else if(user?.state.state == 'price'){
            let state = user.state;
            user.state.price = Number(msg.text);
            user.state.state = 'amount';
            await bot.sendMessage(msg.chat.id,
                `🏃 Trading\n\nPlease Review your new Order\nPool : ${state.jettons.join('/')}\nBuy/Sell : ${state.isBuy ? 'Buy' : 'Sell'}\nPrice : ${state.price} ${state.jettons[state.mainCoin]}\nAmount : ${state.amount} ${state.jettons[state.mainCoin]}`, 
                {
                    reply_markup:{
                    inline_keyboard:[[
                        {text:'I agree', callback_data: JSON.stringify({ method: 'addNewOrder' })},
                        {text:'I don\'t agree', callback_data: JSON.stringify({ method: 'tradingCallback'})}
                    ],[
                        {text:'<< Back', callback_data: 'newStart'}
                    ]]
                    }
                }
            );
        }else{
            return;
        }
        if(user)
        updateUserState(msg.chat!.id, user!.state);
    })

    bot.onText(/\/connect/, handleConnectCommand);

    bot.onText(/\/deposit/, handleSendTXCommand);

    bot.onText(/\/disconnect/, handleDisconnectCommand);

    bot.onText(/\/my_wallet/, handleShowMyWalletCommand);

    bot.onText(/\/start/, handleStartCommand);
}
try {
    main(); 
} catch (error) {
    console.log(error)
}

