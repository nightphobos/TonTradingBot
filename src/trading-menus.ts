import { CallbackQuery } from 'node-telegram-bot-api';
import { getWallets } from './ton-connect/wallets';
import { bot } from './bot';
import { getConnector } from './ton-connect/connector';
import QRCode from 'qrcode';
import * as fs from 'fs';
import { isTelegramUrl } from '@tonconnect/sdk';
import { addTGReturnStrategy, buildUniversalKeyboard } from './utils';
import { updateUserState } from './ton-connect/mongo';

export const tradingMenuClick = {
    select_wallet: onTradingClick,
    universal_qr: onOpenTradingQR
};


async function onOpenTradingQR(query: CallbackQuery, _: string): Promise<void> {
    const chatId = query.message!.chat.id;
    const wallets = await getWallets();

    const connector = getConnector(chatId);

    const link = connector.connect(wallets);

    await editQR(query.message!, link);

    const keyboard = await buildUniversalKeyboard(link, wallets);

    await bot.editMessageReplyMarkup(
        {
            inline_keyboard: [keyboard]
        },
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