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
import { connect, getUserByTelegramID, updateUserState } from './ton-connect/mongo';
import { commandCallback } from './commands-handlers';
import TelegramBot from 'node-telegram-bot-api';
const nacl = TonWeb.utils.nacl;
let tonWeb = new TonWeb();

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

                user!.state.state = 'selljetton';
                user!.state.fromJetton = clickedSymbol;

                bot.sendMessage( query.message!.chat.id,`Please select jetton to buy`);
            }else if ( user!.state.state == 'selljetton' ){

                user!.state.state = 'buyjetton';
                user!.state.toJetton = clickedSymbol;
                
                await bot.editMessageReplyMarkup(
                    {
                        inline_keyboard: [[
                            {text: user!.state.fromJetton, callback_data: `symbol-${user!.state.fromJetton}`},
                            {text: user!.state.toJetton, callback_data: `symbol-${user!.state.toJetton}`}
                        ]] 
                    },
                    {
                        message_id: query.message?.message_id,
                        chat_id: query.message?.chat.id
                    }
                );

                bot.sendMessage( query.message!.chat.id,`Please select Unit of price`);
            }else if ( user!.state.state == 'buyjetton' ){
                user!.state.state = 'limitjetton';
                bot.sendMessage( query.message!.chat.id,`Please type in amount of token`);
            }else if ( user!.state.state == 'limitjetton' ){
                user!.state.state = 'price';
                bot.sendMessage( query.message!.chat.id,`Please type in limit of price`);
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
        if(user?.state.state == 'price'){
            user.state.state = 'amount';
            user.state.price = Number(msg.text);
        }else if(user?.state.state == 'amount'){
            user.state.state = 'tradeCheck';
            user.state.amount = Number(msg.text);
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