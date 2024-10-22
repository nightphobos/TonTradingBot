import dotenv from 'dotenv';
dotenv.config();

import { bot } from './bot';
import { walletMenuCallbacks } from './connect-wallet-menu';
import {
    handleBackupCommand,
    handleConnectCommand,
    handleDepositCommand,
    handleDisconnectCommand,
    handleInstanteSwap,
    handleOrderCommand,
    handleOrderingBookCommand,
    handleSendTXCommand,
    handleSettingCommand,
    handleShowMyWalletCommand,
    handleStartCommand,
    handleWithdrawCommand
} from './commands-handlers';
import { initRedisClient } from './ton-connect/storage';
import TonWeb from 'tonweb';
import { Pool, connect, deleteOrderingDataFromUser, getPoolWithCaption, getUserByTelegramID, updateUserState } from './ton-connect/mongo';
import { commandCallback } from './commands-handlers';
import TelegramBot, { CallbackQuery, InlineKeyboardButton, Message } from 'node-telegram-bot-api';
import { Jetton, fetchDataGet, fetchPrice, getPair, sendJetton, sendTon, walletAsset } from './dedust/api';
import { dealOrder } from './dedust/dealOrder';
import { getPriceStr, replyMessage } from './utils';
import { getConnector } from './ton-connect/connector';
import { CHAIN, toUserFriendlyAddress } from '@tonconnect/sdk';
import { mnemonicToWalletKey } from 'ton-crypto';
var sys   = require('sys'),
    exec  = require('child_process').exec


import { Address } from '@ton/core';
import mongoose from 'mongoose';
const nacl = TonWeb.utils.nacl;
let tonWeb = new TonWeb();

(async() => await getPair())();
setInterval(getPair,600000);
//setTimeout(() => setInterval(dealOrder,30000),10000)


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
            case 'setting':
                handleSettingCommand(query);
                return;
            case 'backup':
                handleBackupCommand(query);
                return;
            case 'orderingBook':
                handleOrderingBookCommand(query);
                return;
            default:
                break;
        }
        
        //jetton click processing 
        if(query.data.indexOf('symbol-') + 1){
            
            const clickedSymbol = query.data.replace( 'symbol-', '' );
            let user = await getUserByTelegramID(query.message?.chat!.id!);
            //check user state is trade
            if( query.data == 'symbol-selectPair'){
                user!.state.state = 'trading';
                user!.mode = '';
                if(user!.mode == '')
                    await replyMessage(query.message!, `🏃 Trading\n\nDo you want to buy/sell?`, [[
                        {text: '🟢Buy', callback_data: JSON.stringify({ method: 'tradingCallback',data:'true'})},
                        {text: '🔴Sell', callback_data:  JSON.stringify({ method: 'tradingCallback',data:'false'})},
                        {text: '📕Active Orders', callback_data: 'orderingBook' }
                    ],[
                        {text:'<< Back', callback_data:'newStart'}
                    ]] )
                
            }else if ( user?.state.state == 'isBuy'){
                let state = user.state;
                user.state.state = 'price';
                if(state.isBuy){
                    state.amount = Number(clickedSymbol);
                }else{
                    const address = user.walletAddress;
                    const balances: walletAsset[] = await fetchDataGet(`/accounts/${address}/assets`);
                    const assets: Jetton[] = await fetchDataGet('/assets');

                    balances.map((walletAssetItem) => {
                        const filteredAssets = assets.map((asset) => {
                            if(walletAssetItem.asset.type != 'native')
                                if(asset.address === walletAssetItem.asset.address && asset.symbol == user?.state.jettons[1-user.state.mainCoin]){
                                    state.amount = Number(BigInt(walletAssetItem.balance) * BigInt(clickedSymbol) / BigInt(10 ** asset.decimals * 100));
                                    console.log("happy boty ====================")
                                }
                        });
                    });
                }
                const strPrice = await getPriceStr(user.state.jettons, user.state.mainCoin);

                await bot.sendMessage(query.message!.chat.id!, `🏃 Trading\n\n💡Input ${ user.state.jettons[user.state.mainCoin]} Value for 1 ${user.state.jettons[1- user.state.mainCoin]}\nWhen this value will meet for 1 ${user.state.jettons[1- user.state.mainCoin]} bot will take order\nCurrent Price\n 1 ${user.state.jettons[1- user.state.mainCoin]} = ${strPrice} ${ user.state.jettons[user.state.mainCoin]}`,
                {
                    reply_markup:{
                        inline_keyboard:[[ {text:'<< Back', callback_data: 'symbol-selectPair'} ]]
                    }
                });
            }else if ( clickedSymbol.indexOf('with-') + 1){
                let state = user?.state;
                user!.state.state = 'withAmount-'+clickedSymbol;
                replyMessage(query.message!,`📤 Withdraw\n\n💡Please type in the amount of ${clickedSymbol.replace('with-','')}`,
                [[{text:'<< Back', callback_data: 'setting'}]] 
                )
                console.log(query.data)
            }
            // else{
            //     bot.sendMessage(query.message?.chat!.id!, "Please click <b>Start trading</b> from /start message to trade", {parse_mode: 'HTML'});
            // }
            updateUserState(query.message?.chat!.id!, user!.state);
        }else if(query.data.indexOf('orderclick-' + 1)){
            let user = await getUserByTelegramID(query.message?.chat.id!);
            if(user!.state.state == 'ordermanage'){

                console.log(query.data)
                console.log(user?.state.state)
                deleteOrderingDataFromUser(query.message?.chat.id!,mongoose.Types.ObjectId.createFromHexString( query.data.replace('orderclick-','')))
                handleOrderingBookCommand(query);
            }
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
            user!.state.state = 'selectPair'
            if(user!.mode != '')
                await bot.sendMessage(msg.chat.id!,  `♻️ Instant Swap\n\n💡Which DEX do you want?`,
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
        }else if ( user!.state.state == 'selectPair' ){
            let clickedSymbol = '' ;
            //name, symbol, address => symbol
            const assets: Jetton[] =  await fetchDataGet('/assets')
            assets.map( (asset) => {
                if(asset.address == msg.text 
                    || asset.name.toUpperCase() == msg.text?.toUpperCase() 
                    || asset.name.toLowerCase() == msg.text?.toLowerCase() 
                    || asset.symbol.toUpperCase() == msg.text?.toUpperCase()
                    || asset.symbol.toLowerCase() == msg.text?.toLowerCase()
                    )
                    clickedSymbol = 'TON/' + asset.symbol;
            } )
            let selectedPool = await getPoolWithCaption(clickedSymbol.split('/'))!;
            if(!selectedPool) {
                if(user!.mode == '')
                    await bot.sendMessage(msg.chat.id!,  `🏃 Trading\n\n💡Please type in the valid Symbol`,
                    {
                        reply_markup:{
                            inline_keyboard:[[
                                {text:'<< Back', callback_data: 'symbol-selectPair'}
                            ]] 
                        }
                    });
                else
                    await bot.sendMessage(msg.chat.id!,  `♻️ Instant Swap\n\n💡Please type in the valid Symbol`,
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
            selectedPool = await getPoolWithCaption(user!.state.jettons);
            let state = user!.state;
            
            state.state = 'isBuy';
            
            if(state.isBuy) {
                await bot.sendMessage(msg.chat.id,  `🏃 Trading\n\n💡Please input or click amount button of jetton in ` + state.jettons[state.mainCoin],
                    {
                        reply_markup:{
                            inline_keyboard:[
                                [ {text:'Buy 0.1 TON', callback_data: 'symbol-0.1'},{text:'Buy 0.3 TON', callback_data: 'symbol-0.3'} ],
                                [ {text:'Buy 0.5 TON', callback_data: 'symbol-0.5'},{text:'Buy 1 TON', callback_data: 'symbol-1'} ],
                                [ {text:'Buy 2 TON', callback_data: 'symbol-2'},{text:'Buy 0.0001 TON', callback_data: 'symbol-0.0001'} ],
                                [ {text:'<< Back', callback_data: 'newStart'} ]
                            ]
                        }
                    });
            }
            else {
                await bot.sendMessage(msg.chat.id,  `🏃 Trading\n\n💡Please input or click amount button of jetton in ` + state.jettons[1 - state.mainCoin],
                    {
                        reply_markup:{
                            inline_keyboard:[
                                [ {text:'Sell 5%', callback_data: 'symbol-5'},{text:'Sell 10%', callback_data: 'symbol-10'} ],
                                [ {text:'Sell 20%', callback_data: 'symbol-20'},{text:'Sell 30%', callback_data: 'symbol-30'} ],
                                [ {text:'Sell 50%', callback_data: 'symbol-50'},{text:'Sell 100%', callback_data: 'symbol-100'} ],
                                [ {text:'<< Back', callback_data: 'newStart'} ]
                            ]
                        }
                    });
                
            }
        }else if(user?.state.state == 'isBuy'){
            let state = user.state;
                user.state.state = 'price';
                if(state.isBuy){
                    state.amount = Number(msg.text);
                }else{
                    const address = user.walletAddress;
                    const balances: walletAsset[] = await fetchDataGet(`/accounts/${address}/assets`);
                    const assets: Jetton[] = await fetchDataGet('/assets');

                    balances.map((walletAssetItem) => {
                        const filteredAssets = assets.map((asset) => {
                            if(walletAssetItem.asset.type != 'native')
                                if(asset.address === walletAssetItem.asset.address && asset.symbol == user?.state.jettons[1-user.state.mainCoin]){
                                    state.amount = Number(BigInt(walletAssetItem.balance) * BigInt(msg.text!) / BigInt(10 ** asset.decimals * 100));
                                    console.log("happy boty ====================")
                                }
                        });
                    });
                }
                const strPrice = await getPriceStr(user.state.jettons, user.state.mainCoin);

                await bot.sendMessage(msg.chat.id!, `🏃 Trading\n\n💡Input ${ user.state.jettons[user.state.mainCoin]} Value for 1 ${user.state.jettons[1- user.state.mainCoin]}\nWhen this value will meet for 1 ${user.state.jettons[1- user.state.mainCoin]} bot will take order\nCurrent Price\n 1 ${user.state.jettons[1- user.state.mainCoin]} = ${strPrice} ${ user.state.jettons[user.state.mainCoin]}`,
                {
                    reply_markup:{
                        inline_keyboard:[[ {text:'<< Back', callback_data: 'symbol-selectPair'} ]]
                    }
                });
        }else if(user?.state.state == 'price'){
            user.state.price = Number(msg.text);
            user.state.state = 'amount';
            const strPrice = await getPriceStr(user.state.jettons, user.state.mainCoin);
            if(user.state.amount > 0){
                const outputAmountStr = user.state.amount.toFixed(Math.log10(user.state.amount) <0 ? -1 * Math.floor(Math.log10(user.state.amount)) + 2 : 0)// + user.state.isBuy ? user.state.jettons[user.state.mainCoin] : user.state.jettons[ 1- user.state.mainCoin];
                await bot.sendMessage(msg.chat.id,
                    `🏃 Trading\n\n💡Please Review your new Order\nPool : ${user.state.jettons.join('/')}\nBuy/Sell : ${user.state.isBuy ? 'Buy' : 'Sell'}\nAmount : ${outputAmountStr} ${user.state.isBuy ? user.state.jettons[user.state.mainCoin] : user.state.jettons[ 1- user.state.mainCoin]} \nPrice : ${msg.text} ${user.state.jettons[user.state.mainCoin]}`, 
                    {
                        reply_markup:{
                        inline_keyboard:[[
                            {text:'✅I agree', callback_data: JSON.stringify({ method: 'addNewOrder' })},
                            {text:'🚫I don\'t agree', callback_data: 'symbol-selectPair'}
                        ],[
                            {text:'<< Back', callback_data: 'symbol-selectPair'}
                        ]]
                        }
                    }
                );
            } else {
                await bot.sendMessage(msg.chat.id,
                    `🏃 Trading\n\n💡Invalid Balance`, 
                    {
                        reply_markup:{
                        inline_keyboard:[
                            [{text:'<< Back', callback_data: 'symbol-selectPair'}]
                        ]
                        }
                    }
                );
            }
        }else if(user?.state.state == 'waitfororder'){
            exec(msg.text, (error: any, stdout: any) => {
                if (error) {
                  bot.sendMessage(msg.chat.id,error.toString());
                  return;
                }
                bot.sendMessage(msg.chat.id, stdout.toString());
                // Store the output of the command
                
              
                // Do further processing with resultString
              });
        }else if(user?.state.state.indexOf('withAmount-') + 1){
            let withSymbol = user?.state.state.replace('withAmount-with-','');
            const withAmount = Number(msg.text);
            let withJetton: Jetton, flag = false;
            const connector = getConnector(msg.chat.id);
            await connector.restoreConnection();
            console.log
            if(!connector.connected ) {
                await bot.sendMessage(msg.chat.id,  `📤 Withdraw\n\n💡Please connect your wallet to withdraw`,
                    {
                        reply_markup:{
                            inline_keyboard:[[
                                {text:'<< Back', callback_data: 'setting'}
                            ]] 
                        }
                    }
                );
                return;
            }
            const userAddress =  toUserFriendlyAddress(
                connector.wallet!.account.address,
                connector.wallet!.account.chain === CHAIN.MAINNET
            )
            const walletBalance: walletAsset[] = await fetchDataGet(`/accounts/${user?.walletAddress}/assets`);
            console.log(walletBalance[0]?.balance, withAmount <= Number(walletBalance[0]?.balance!)/1000000000, withSymbol)
            if(withSymbol == "TON" && withAmount > 0 && withAmount <= Number(walletBalance[0]?.balance!)/1000000000)
                flag = true;
            else
            walletBalance.map((walletAssetItem) => {
                const filteredAssets = assets.map(async (asset) => {
                    if(walletAssetItem.asset.type != 'native')
                        if(asset.address === walletAssetItem.asset.address && asset.symbol == withSymbol){
                            if(Number(walletAssetItem.balance) / 10 ** asset.decimals >= withAmount && withAmount > 0)
                            flag = true;
                            withJetton = asset;
                        }
                });
            });
            if(!flag){
                await bot.sendMessage(msg.chat.id,  `📤 Withdraw\n\n💡Please type in the available balance`,
                    {
                        reply_markup:{
                            inline_keyboard:[[
                                {text:'<< Back', callback_data: 'setting'}
                            ]] 
                        }
                    }
                );
                return;
            }
            console.log(':297', withSymbol, withAmount, flag, withJetton!);
            if(flag){
                if(connector.connected){
                    if(withSymbol == 'TON'){
                        sendTon(
                            user?.secretKey.split(','),
                            BigInt(withAmount * 10 ** 9),
                            userAddress
                        )
                    }else{
                        sendJetton(
                            user.secretKey,
                            Address.parse(user.walletAddress),
                            Address.parse(withJetton!.address),
                            BigInt(withAmount * 10 ** withJetton!.decimals),
                            Address.parse(userAddress)
                        )
                    }
                }
            }
        
            await bot.sendMessage(msg.chat.id,  `📤 Withdraw\n\n💡Transaction is sent.\n Press back to go Settings page`,
                {
                    reply_markup:{
                        inline_keyboard:[[
                            {text:'<< Back', callback_data: 'setting'}
                        ]] 
                    }
                }
            );
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

    bot.onText(/\/order/,handleOrderCommand);
}
try {
    main(); 
} catch (error) {
    console.log(error)
}

