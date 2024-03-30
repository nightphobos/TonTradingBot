import { Factory, JettonWallet, MAINNET_FACTORY_ADDR, VaultJetton } from '@dedust/sdk';
import { Address, TonClient4, Sender, WalletContractV3R2, WalletContractV4 } from '@ton/ton';
import { OpenedContract, toNano } from '@ton/core';
import { Asset, PoolType, ReadinessStatus, JettonRoot } from '@dedust/sdk';
import axios from 'axios';
import { mnemonicToWalletKey } from '@ton/crypto';
import { WalletContract } from 'tonweb/dist/types/contract/wallet/wallet-contract';
const tonClient = new TonClient4({ endpoint: 'https://mainnet-v4.tonhubapi.com' });
const factory = tonClient.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));

export interface Asset{
    type: string,
    address: string,
    name: string,
    symbol: string,
    image: string
    decimals: string,
    riskScore: string,
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
        gasAmount: toNano(0.25)
    });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function jetton_to_Ton(
    sender: Sender,
    userAddress: Address,
    jettonAddress: Address,
    jettonAmount: number
) {
    const jettonRoot = tonClient.open(JettonRoot.createFromAddress(jettonAddress));
    let jettonWallet: OpenedContract<JettonWallet>;
    if (userAddress) jettonWallet = tonClient.open(await jettonRoot.getWallet(userAddress));
    else {
        console.log('cannot find wallet!!!', sender);
        return;
    }
    const jettonVault: VaultJetton = tonClient.open(await factory.getJettonVault(jettonAddress));

    const TON = Asset.native();
    const jetton = Asset.jetton(jettonAddress);
    const pool = tonClient.open(await factory.getPool(PoolType.VOLATILE, [jetton, TON]));

    if ((await pool.getReadinessStatus()) !== ReadinessStatus.READY) {
        throw new Error("Pool (TON, SCALE) does not exist.");
    }
    console.log(pool);
    const result = await jettonWallet.sendTransfer(sender, toNano(0.3), {
        amount: toNano(jettonAmount),
        destination: jettonVault.address,
        responseAddress: userAddress, // return gas to user
        forwardAmount: toNano(0.25),
        forwardPayload: VaultJetton.createSwapPayload({ poolAddress: pool.address })
    });
    console.log(result);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function jetton_to_Jetton(
    sender: Sender,
    userAddress: Address,
    jettonAddress_A: Address,
    jettonAddress_B: Address,
    fromAmount: number
) {
    const jetton_A = Asset.jetton(jettonAddress_A);
    const TON = Asset.native();
    const jetton_B = Asset.jetton(jettonAddress_B);

    const TON_JETTON_A = tonClient.open(await factory.getPool(PoolType.VOLATILE, [TON, jetton_A]));
    const TON_JETTON_B = tonClient.open(await factory.getPool(PoolType.VOLATILE, [TON, jetton_B]));
    console.log(TON_JETTON_A, TON_JETTON_B);
    const jettonVault_A: VaultJetton = tonClient.open(
        await factory.getJettonVault(jettonAddress_A)
    );
    const jettonRoot = tonClient.open(JettonRoot.createFromAddress(jettonAddress_A));
    const jettonWallet = tonClient.open(await jettonRoot.getWallet(userAddress));

    await jettonWallet.sendTransfer(
        sender,
        toNano(0.3), // 0.6% TON
        {
            amount: toNano(fromAmount),
            destination: jettonVault_A.address,
            responseAddress: userAddress, // return gas to user
            forwardAmount: toNano(0.25), // 0.5% TON
            forwardPayload: VaultJetton.createSwapPayload({
                poolAddress: TON_JETTON_A.address, // first step: A -> TON
                next: {
                    poolAddress: TON_JETTON_B.address // next step: TON -> B
                }
            })
        }
    );
}

//eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export async function fetchDataGet(fetchURL: String) {
    try {
        const response = await axios.get('https://api.dedust.io/v2' + fetchURL, {
            headers: {
                accept: 'application/json'
            }
        });
        console.log('Fetch Success => https://api.dedust.io/v2' + fetchURL); // Output the response data
        return response.data;
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

export async function fetchPrice(amount: number, from: string, to: string){
    return axios.post('https://api.dedust.io/v2/routing/plan', { amount, from, to });
} 

export async function getPair(){
    const assets: Asset[] = await fetchDataGet('/assets');
    let pools: Pool[] = await fetchDataGet('/v2/pools-lite');
    pools.
    pools.filter((pool) => (
            pool.assets[0] == 'native' ||
            pool.assets[0] == 'EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA' ||
            pool.assets[0] == 'native' ||
            pool.assets[0] == 'native' 
        )
    );
    pools.map((pool,index) => {
        pool.TVL = pool.reserves[0]! *  
    });
} 

async function main() {
                                                                                                                                                    const mnemonic = `goddess,final,pipe,heart,venture,ship,link,hedgehog,way,receive,ridge,pluck,giraffe,mansion,analyst,provide,easy,cruel,kiss,list,use,laundry,wage,cricket`
    const keyPair = await mnemonicToWalletKey(mnemonic.split(','));
    const wallet = tonClient.open(
        WalletContractV4.create({
            workchain: 0,
            publicKey: keyPair.publicKey
        })
    );
    console.log('main');
    //const jettonAddress = Address.parse('EQA2kCVNwVsil2EM2mB0SkXytxCqQjS4mttjDpnXmwG9T6bO');
    const jUSDTAddress = Address.parse('EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA');
    let sender = await wallet.sender(keyPair.secretKey);
    //sender.address = wallet.address;
    console.log(keyPair, wallet.address);
    //await ton_to_Jetton(sender, jettonAddress, 0.00005);
    //await jetton_to_Ton(sender, wallet.address, jUSDTAddress, 0.00005);
    //await jetton_to_Jetton(sender, wallet.address, jettonAddress, jUSDTAddress, 0.00005);
}