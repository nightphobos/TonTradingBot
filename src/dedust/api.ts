import { Factory, MAINNET_FACTORY_ADDR } from '@dedust/sdk';
import { Address, TonClient4,Sender } from "@ton/ton";
import { toNano } from '@ton/core';
import { Asset, VaultNative, PoolType, ReadinessStatus , DeDustClient } from '@dedust/sdk';
import axios from 'axios';
const tonClient = new TonClient4({ endpoint: "https://mainnet-v4.tonhubapi.com" });
const factory = tonClient.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));
const dedustClient = new DeDustClient({ endpointUrl: 'https://api.dedust.io' });

export async function nationJettonSwap(sender :Sender,jettonAddress: string, isbuy: boolean){
    const tonVault = tonClient.open(await factory.getNativeVault());
    const jetton_ADDRESS = Address.parse(jettonAddress);

    const TON = Asset.native();
    const jetton = Asset.jetton(jetton_ADDRESS);

    const pool = tonClient.open(await factory.getPool(PoolType.VOLATILE, [TON, jetton]));
    
    if ((await pool.getReadinessStatus()) !== ReadinessStatus.READY) {
        throw new Error('Pool (TON, jetton) does not exist.');
    }
    const amountIn = toNano('5'); // 5 TON
    await tonVault.sendSwap(sender, {
    poolAddress: pool.address,
    amount: amountIn,
    gasAmount: toNano("0.25"),
    });
}

export async function fetchData(fetchURL : String) {
    try {
        const response = await axios.get('https://api.dedust.io/v2' + fetchURL, {
            headers: {
                'accept': 'application/json'
            }
        });
        return(response)
        console.log('Fetch Success => https://api.dedust.io/v2' + fetchURL); // Output the response data
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}