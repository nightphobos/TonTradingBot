import { CallbackQuery } from 'node-telegram-bot-api';
import { getWallets } from './ton-connect/wallets';
import { bot } from './bot';
import axios from 'axios';
import { getUserByTelegramID, updateUserState } from './ton-connect/mongo';

interface Jetton {
    type: string;
    address: string;
    name: string;
    symbol: string;
    image: string;
    decimals: number;
    riskScore: number;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, unused-imports/no-unused-vars
async function showAssetsButtons(query: CallbackQuery) {
    const assets: Array<Jetton> = await axios.get('https://api.dedust.io/v2/assets', {
        headers: {
            accept: 'application/json'
        }
    });
    // let buttonArray = [Math.floor(assets.length / 4) + 1][4];
    // for (let i = 0; i < buttonArray.length; i++) {
    //     for (let j = 0; j < 4; j++) {
    //         if (assets[i * 4 + j])
    //             buttonArray[i][j] = {
    //                 text: assets[i * 4 + j].symbol,
    //                 callback_data: JSON.stringify({
    //                     method: 'jettonAddressSelect',
    //                     data: assets[i * 4 + j].address
    //                 })
    //             }
    //     }
    // }
    let buttonArray: { text: string; callback_data: string }[][] = [];

    for (let i = 0; i < Math.floor(assets.length / 4) + 1; i++) {
        buttonArray[i] = [];
        for (let j = 0; j < 4; j++) {
            const index = i * 4 + j;
            if (index < assets.length) {
                buttonArray[i][j] = {
                    text: assets[index]?.symbol,
                    callback_data: JSON.stringify({
                        method: 'jettonAddressSelect',
                        data: assets[index]?.address
                    })
                };
            }
        }
    }
    bot.editMessageReplyMarkup(
        { inline_keyboard: buttonArray },
        {
            message_id: query.message?.message_id,
            chat_id: query.message?.chat.id
        }
    );
}

export async function onFromJetton(query: CallbackQuery, _: string): Promise<void> {
    const user = await getUserByTelegramID(query.from.id);
    await updateUserState(query.from.id, { ...user['state'], state: 'getFromJettonAddress' });
    await showAssetsButtons(query);
}

export async function onToJetton(query: CallbackQuery, _: string): Promise<void> {
    const user = await getUserByTelegramID(query.from.id);
    await updateUserState(query.from.id, { ...user['state'], state: 'getFromJettonAddress' });
    await showAssetsButtons(query);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function jettonAddressSelect(query: CallbackQuery, _: string): Promise<void> {
    const user = await getUserByTelegramID(query.from.id);
    if (_ === 'getFromJettonAddress') user!.state.fromJetton = _;
    else if (_ === 'getToJettonAddress') user!.state.toJetton = _;
    await updateUserState(query.from.id, user!.state);
    if (_ === 'getFromJettonAddress') onToJetton(query, '');
    else if (_ === 'getToJettonAddress') user!.state.toJetton = _;
}

export async function onGetPrice(query:CallbackQuery, _:string):Promise<void> {
    
}