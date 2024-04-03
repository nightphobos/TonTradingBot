import dotenv from 'dotenv';
dotenv.config();

import { bot } from './bot';
import { walletMenuCallbacks } from './connect-wallet-menu';
import {
    handleConnectCommand,
    handleDepositCommand,
    handleDisconnectCommand,
    handleInstanteSwap,
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
import { Jetton, fetchDataGet, getPair } from './dedust/api';
import { dealOrder } from './dedust/dealOrder';
import { replyMessage } from './utils';
import { getConnector } from './ton-connect/connector';
const nacl = TonWeb.utils.nacl;
let tonWeb = new TonWeb();

(async() => await getPair())();
setInterval(getPair,600000);
setTimeout(dealOrder,10000)


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
            case 'instanteSwap':
                handleInstanteSwap(query);
                return;
            default:
                break;
        }
        
        //jetton click processing 
        if(query.data.indexOf('symbol-') + 1){
            const clickedSymbol = query.data.replace( 'symbol-', '' );
            let user = await getUserByTelegramID(query.message?.chat!.id!);
            //check user state is trade
            if( user!.state.state == 'trading' ){
                user!.state.state = 'selectPair';
                let selectedPool = await getPoolWithCaption(clickedSymbol.split('/'));
                user!.state.jettons = clickedSymbol.split('/');
                user!.state.mainCoin = selectedPool!.main;
                if(user!.mode == '')
                    await replyMessage(query.message!, `🏃 Trading\n\nDo you want to buy/sell?`, [[
                        {text: 'Buy', callback_data: `symbol-buy`},
                        {text: 'Sell', callback_data: `symbol-sell`}
                    ],[
                        {text:'<< Back', callback_data:  JSON.stringify({
                            method: 'tradingCallback'
                        })}
                    ]] )
                else 
                    await replyMessage(query.message!, `♻️ Instant Swap\n\nDo you want to buy/sell?`, [[
                        {text: 'Buy', callback_data: `symbol-buy`},
                        {text: 'Sell', callback_data: `symbol-sell`}
                    ],[
                        {text:'<< Back', callback_data: 'instanteSwap'}
                    ]] )
            }else if ( user!.state.state == 'selectPair' ){
                let selectedPool = await getPoolWithCaption(user!.state.jettons);
                let state = user!.state;

                state.state = 'isBuy';

                if(clickedSymbol == 'buy') state.isBuy = true 
                else state.isBuy = false;

                const price = selectedPool?.prices[1-state.mainCoin]! / selectedPool?.prices[state.mainCoin]!;
                
                await replyMessage(query.message!, 
                    `🏃 Trading\n\n💡Please input amount of jetton in ` + state.jettons[1 - state.mainCoin]/* 1 ${state.jettons[1-state.mainCoin]} ≈ ${price} ${state.jettons[state.mainCoin]}`*/,
                    [[ {text:'<< Back', callback_data: 'newStart'} ]]
                )
                
            }
            // else{
            //     bot.sendMessage(query.message?.chat!.id!, "Please click <b>Start trading</b> from /start message to trade", {parse_mode: 'HTML'});
            // }
            updateUserState(query.message?.chat!.id!, user!.state);
        }
        if(query.data.indexOf('with-') + 1){
            const clickedSymbol = query.data.replace( 'with-', '' );
            let user = await getUserByTelegramID(query.message?.chat!.id!);
            let state = user?.state;

            state!.state = query.data;

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
        
        let user = await getUserByTelegramID(msg.chat!.id);
        let assets: Jetton[] = await fetchDataGet('/assets');
        if(!!!user) return;
        if( user!.state.state == 'trading' ){

            let clickedSymbol = '' ;
            //name, symbol, address => symbol
            
            assets.map( (asset) => {
                if(asset.address == msg.text 
                    || asset.name.toUpperCase() == msg.text?.toUpperCase() 
                    || asset.name.toLowerCase() == msg.text?.toLowerCase() 
                    || asset.symbol.toUpperCase() == msg.text?.toUpperCase()
                    || asset.symbol.toLowerCase() == msg.text?.toLowerCase()
                    )
                    clickedSymbol = 'TON/' + asset.symbol;
            } )
            let selectedPool = await getPoolWithCaption(clickedSymbol.split('/'));
            if(!selectedPool) {
                if(user!.mode == '')
                    await bot.sendMessage(msg.chat.id,  `🏃 Trading\n\n💡Please type in the valid Symbol`,
                    {
                        reply_markup:{
                            inline_keyboard:[[
                                {text:'<< Back', callback_data:  JSON.stringify({ method: 'tradingCallback'})}
                            ]] 
                        }
                    });
                else
                    await bot.sendMessage(msg.chat.id,  `♻️ Instant Swap\n\n💡Please type in the valid Symbol`,
                    {
                        reply_markup:{
                            inline_keyboard:[[
                                {text:'<< Back', callback_data: 'instanteSwap'}
                            ]] 
                        }
                    });
                return;
            }
            user!.state.state = 'selectPair';
            user!.state.jettons = clickedSymbol.split('/');
            user!.state.mainCoin = selectedPool!.main;
            if(user!.mode == '')
                await bot.sendMessage(msg.chat.id,  `🏃 Trading\n\n💡Do you want to buy/sell?`,
                {
                    reply_markup:{
                        inline_keyboard:[[
                            {text: '🟢 Buy', callback_data: `symbol-buy`},
                            {text: '🔴 Sell', callback_data: `symbol-sell`}
                        ],[
                            {text:'<< Back', callback_data:  JSON.stringify({ method: 'tradingCallback'})}
                        ]] 
                    }
                }); 
            else
                await bot.sendMessage(msg.chat.id,  `♻️ Instant Swap\n\n💡Which DEX do you want?`,
                {
                    reply_markup:{
                        inline_keyboard:[[
                            {text: 'Ston.fi', web_app:{url:`https://app.ston.fi/swap?chartVisible=false&chartInterval=1w&ft=${user!.state.jettons[user!.state.mainCoin]}&tt=${user!.state.jettons[1-user!.state.mainCoin]}&fa=1`}},
                            {text: 'Dedust.io', web_app:{url:'https://dedust.io/swap'}}
                        ],[
                            {text:'<< Back', callback_data: 'instanteSwap'}
                        ]] 
                    }
                }); 
        }else if(user?.state.state == 'isBuy'){
            user.state.state = 'price';
            user.state.amount = Number(msg.text);
            await bot.sendMessage(msg.chat.id, ` Trading\n\n💡Input ${ user.state.jettons[user.state.mainCoin]} Value for 1 ${user.state.jettons[1- user.state.mainCoin]}\nWhen this value will meet for 1 ${user.state.jettons[1- user.state.mainCoin]} bot will take order`,
            {
                reply_markup:{
                    inline_keyboard:[[ {text:'<< Back', callback_data: JSON.stringify({ method: 'tradingCallback'})} ]]
                }
            });
        }else if(user?.state.state == 'price'){
            let state = user.state;
            user.state.price = Number(msg.text);
            user.state.state = 'amount';
            await bot.sendMessage(msg.chat.id,
                `🏃 Trading\n\n💡Please Review your new Order\nPool : ${state.jettons.join('/')}\nBuy/Sell : ${state.isBuy ? 'Buy' : 'Sell'}\nAmount : ${state.amount} ${state.jettons[1-state.mainCoin]} \nPrice : ${state.price} ${state.jettons[state.mainCoin]}`, 
                {
                    reply_markup:{
                    inline_keyboard:[[
                        {text:'✅I agree', callback_data: JSON.stringify({ method: 'addNewOrder' })},
                        {text:'🚫I don\'t agree', callback_data: JSON.stringify({ method: 'tradingCallback'})}
                    ],[
                        {text:'<< Back', callback_data: JSON.stringify({ method: 'tradingCallback'})}
                    ]]
                    }
                }
            );
        }else if(user?.state.state.indexOf('with-') + 1){
            let withSymbol = user?.state.state.replace('with-','');
            await bot.sendMessage(msg.chat.id,  `🏃 Trading\n\n💡Please type in the amount of ${withSymbol}`,
                {
                    reply_markup:{
                        inline_keyboard:[[
                            {text:'<< Back', callback_data: JSON.stringify({ method: 'tradingCallback'})}
                        ]] 
                    }
                }
            );
            let state = user?.state;
            state.state = 'withAmount-' + withSymbol;
            updateUserState(msg.chat.id!, state);
        
        }else if(user?.state.state.indexOf('withAmount-') + 1){
            let withSymbol = user?.state.state.replace('withAmount-','');
            let amount = Number(msg.text);
            let outputStr = '';
            if(amount > 0){
                const connector = getConnector(msg.chat.id);
                if(connector.connected){

                }
            }
        }else{
             return;
        }
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

