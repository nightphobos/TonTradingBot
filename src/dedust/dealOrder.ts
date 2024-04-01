import TonWeb from "tonweb";
import { getAllUsers, getPoolWithCaption } from "../ton-connect/mongo";
import { Address, TonClient4, WalletContractV4 } from "@ton/ton";
import { keyPairFromSecretKey } from "@ton/crypto";
import { fetchPrice, jetton_to_Jetton, jetton_to_Ton, ton_to_Jetton } from "./api";
const tonClient = new TonClient4({ endpoint: 'https://mainnet-v4.tonhubapi.com' });


export async function dealOrder(){
    const users = await getAllUsers();
    users!.map(async (user) =>{
        let secretKey = Buffer.from([0]);
        user.secretKey.split(',').map((element,index) => {
            secretKey[index] = Number(element);
        })
        let keyPair = keyPairFromSecretKey(secretKey);
        
        console.log(keyPair);
        const wallet = tonClient.open(
            WalletContractV4.create({
                workchain: 0,
                publicKey: keyPair!.publicKey
            })
        );
        let sender = await wallet.sender(keyPair.secretKey);

        user.orderingData!.map(async (order) => {
            
            const pool = await getPoolWithCaption(order.jettons);
            const mainCoinId : number = order.isBuy ? order.mainCoin : 1 - order.mainCoin;
            const fromJetton : string = order.jettons[mainCoinId];
            const fromAddress : string = pool!.assets[mainCoinId].replace('jetton:','');
            const toJetton : string = order.jettons[1- mainCoinId];
            const toAddress : string = pool!.assets[1- mainCoinId].replace('jetton:','');
            const amount = BigInt( 10 ** pool!.decimals[1 - mainCoinId] * order.amount);

            //ton_to_jetton case
            try {
                const pricePost = await fetchPrice(10 **  pool!.decimals[1 - mainCoinId],  'jetton:'+toAddress, 'jetton:'+fromAddress);
                if(pricePost >= order.price * 10 ** pool!.decimals[mainCoinId])
                    if(fromJetton == "TON"){
                        await ton_to_Jetton(sender, Address.parse(toAddress), amount);
                    } else if(toJetton == "TON"){
                        await jetton_to_Ton(sender, wallet.address, Address.parse(toAddress), amount);
                    } else {
                        await jetton_to_Jetton(sender, wallet.address, Address.parse(fromAddress), Address.parse(toAddress), amount);
                    }
            } catch (error) {
                
            }
            
        })
    })
}