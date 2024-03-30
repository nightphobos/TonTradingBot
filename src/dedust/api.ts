import { Factory, MAINNET_FACTORY_ADDR, VaultJetton } from '@dedust/sdk';
import { Address, TonClient4, Sender } from '@ton/ton';
import { toNano } from '@ton/core';
import { Asset, PoolType, ReadinessStatus, JettonRoot } from '@dedust/sdk';
import axios from 'axios';
const tonClient = new TonClient4({ endpoint: 'https://mainnet-v4.tonhubapi.com' });
const factory = tonClient.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));

// Define interfaces
export interface asset {
    _id?: ObjectId;
    amount: number;
    fromToken: string;
    toToken: string;
    limitPrice: number;
    maxMin: number;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function ton_to_Jetton(sender: Sender, jettonAddress: Address, amountIn: number) {
    const tonVault = tonClient.open(await factory.getNativeVault());

    const TON = Asset.native();
    const jetton = Asset.jetton(jettonAddress);

    const pool = tonClient.open(await factory.getPool(PoolType.VOLATILE, [TON, jetton]));

    if ((await pool.getReadinessStatus()) !== ReadinessStatus.READY) {
        throw new Error('Pool (TON, jetton) does not exist.');
    }

    await tonVault.sendSwap(sender, {
        poolAddress: pool.address,
        amount: toNano(amountIn),
        gasAmount: toNano(amountIn * 0.005)
    });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function jetton_to_Ton(sender: Sender, jettonAddress: Address, amountOut: number) {
    const jettonRoot = tonClient.open(JettonRoot.createFromAddress(jettonAddress));
    const jettonWallet = tonClient.open(
        await jettonRoot.getWallet(sender.address ?? Address.parse('0'))
    );
    const jettonVault: VaultJetton = tonClient.open(await factory.getJettonVault(jettonAddress));

    const TON = Asset.native();
    const jetton = Asset.jetton(jettonAddress);
    const pool = tonClient.open(await factory.getPool(PoolType.VOLATILE, [TON, jetton]));

    await jettonWallet.sendTransfer(sender, toNano(amountOut * 0.006), {
        amount: toNano(amountOut),
        destination: jettonVault.address,
        responseAddress: sender.address, // return gas to user
        forwardAmount: toNano(amountOut * 0.005),
        forwardPayload: VaultJetton.createSwapPayload({ poolAddress: pool.address })
    });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function jetton_to_Jetton(
    sender: Sender,
    jettonAddress_A: Address,
    jettonAddress_B: Address,
    amount: number
) {

    const jetton_A = Asset.jetton(jettonAddress_A);
    const TON = Asset.native();
    const jetton_B = Asset.jetton(jettonAddress_B);

    const TON_JETTON_A = tonClient.open(await factory.getPool(PoolType.VOLATILE, [TON, jetton_A]));
    const TON_JETTON_B = tonClient.open(await factory.getPool(PoolType.VOLATILE, [TON, jetton_B]));

    const jettonVault_A: VaultJetton = tonClient.open(
        await factory.getJettonVault(jettonAddress_A)
    );

    const jettonRoot = tonClient.open(JettonRoot.createFromAddress(jettonAddress_A));
    const jettonWallet = tonClient.open(
        await jettonRoot.getWallet(sender.address ?? Address.parse('0'))
    );

    await jettonWallet.sendTransfer(
        sender,
        toNano(amount * 0.006), // 0.6% TON
        {
            amount: toNano(amount),
            destination: jettonVault_A.address,
            responseAddress: sender.address, // return gas to user
            forwardAmount: toNano(amount * 0.005), // 0.5% TON
            forwardPayload: VaultJetton.createSwapPayload({
                poolAddress: TON_JETTON_A.address, // first step: A -> TON
                limit: toNano(1),
                next: {
                    poolAddress: TON_JETTON_B.address // next step: TON -> B
                }
            })
        }
    );
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function fetchData(fetchURL: String) {
    try {
        const response = await axios.get('https://api.dedust.io/v2' + fetchURL, {
            headers: {
                accept: 'application/json'
            }
        });
        console.log('Fetch Success => https://api.dedust.io/v2' + fetchURL); // Output the response data
        return response;
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}
