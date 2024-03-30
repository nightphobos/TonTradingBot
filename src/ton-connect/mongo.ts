import { MongoClient, ObjectId, Collection } from 'mongodb';

// Define interfaces
export interface OrderingData {
    _id?: ObjectId;
    amount: number;
    fromToken: string;
    toToken: string;
    limitPrice: number;
    maxMin: number;
}

export interface User {
    _id?: ObjectId;
    telegramID: number;
    walletAddress: string;
    secretKey: string;
    publicKey:string;
    state: {
        state: string;
        fromJetton: string;
        toJetton: string;
        amount: number;
        price: number; // toJetton x amount = $fromJetton
        isBuy: boolean;
    };
    orderingData?: OrderingData[];
}


 export interface Pool {
    caption: string[],
    address: string,
    lt: string,
    totalSupply: number,
    type: string,
    tradeFee: number,
    prices: number[],
    assets: string[],
    reserves: number[],
    fees: number[],
    volume: number[],
    TVL: number,
}

// MongoDB connection URI
const uri = 'mongodb://127.0.0.1:27017/';
const dbName = 'TelegramBot';

// Connect to MongoDB
export async function connect(): Promise<MongoClient> {
    const client = new MongoClient(uri);
    await client.connect();
    return client;
}
//update user states
export async function updateUserState(telegramID: number, newState: User['state']): Promise<void> {
    const db = await connect();
    await db
        .db(dbName)
        .collection<User>('users')
        .updateOne({ telegramID }, { $set: { state: newState } });
}
// Create a new user
export async function createUser(user: User): Promise<ObjectId> {
    const db = await connect();
    const result = await db.db(dbName).collection<User>('users').insertOne(user);
    return result.insertedId;
}

// Get a user by Telegram ID
export async function getUserByTelegramID(telegramID: number): Promise<User | null> {

    const db = await connect();
    return db
        .db(dbName)
        .collection<User>('users')
        .findOne({ telegramID });
}

// Add ordering data to a user
export async function addOrderingDataToUser(
    telegramID: number,
    orderingData: OrderingData
): Promise<void> {
    const db = await connect();
    await db
        .db(dbName)
        .collection<User>('users')
        .updateOne({ telegramID }, { $push: { orderingData } });
}

// Delete ordering data from a user
export async function deleteOrderingDataFromUser(
    telegramID: number,
    orderingDataId: ObjectId
): Promise<void> {
    const db = await connect();
    await db
        .db(dbName)
        .collection<User>('users')
        .updateOne({ telegramID }, { $pull: { orderingData: { _id: orderingDataId } } });
}

// Get a user by Telegram ID with ordering data
export async function getUserByTelegramIDWithOrderingData(
    telegramID: number
): Promise<User | null> {
    const db = await connect();
    return db.db(dbName).collection<User>('users').findOne({ telegramID });
}

// Create a new pool
export async function createPool(user: Pool): Promise<ObjectId> {
    const db = await connect();
    const result = await db.db(dbName).collection<Pool>('pools').insertOne(user);
    return result.insertedId;
}

// Get a pool by caption
export async function getPoolWithCaption(
    caption: string[]
): Promise<User | null> {
    const db = await connect();
    return db.db(dbName).collection<Pool>('pools').findOne({caption});
}


// // Example usage
// export async function main() {
//     // Retrieve a user by Telegram ID with ordering data
//     const userWithOrderingData = await getUserByTelegramIDWithOrderingData('123456789');
//     console.log('User with ordering data:', userWithOrderingData);
// }

export default {
    connect,
    createUser,
    getUserByTelegramID,
    addOrderingDataToUser,
    deleteOrderingDataFromUser,
    getUserByTelegramIDWithOrderingData
};
