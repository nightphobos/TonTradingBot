import { MongoClient, ObjectId, Collection } from 'mongodb';

// Define interfaces
export interface OrderingData {
    _id?: ObjectId;
    jettons: string[];
    mainCoin: number;
    amount: number;
    price: number; // toJetton x amount = $fromJetton
    isBuy: boolean;
}

export interface User {
    _id?: ObjectId;
    telegramID: number;
    walletAddress: string;
    secretKey: string;
    publicKey:string;
    state: {
        state: string;
        jettons: string[];
        mainCoin: number;
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
    volume: bigint[],
    decimals: number[],
    TVL: number,
    main:number,
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

// Get a user by Telegram ID
export async function getAllUsers(): Promise<User[] | null> {

    const db = await connect();
    return db
        .db(dbName)
        .collection<User>('users')
        .find({}).toArray();
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

async function executeWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Operation timed out'));
        }, timeout);

        promise.then((result) => {
            clearTimeout(timer);
            resolve(result);
        }).catch((error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}

// Create a new pool
export async function createPool(pool: Pool, timeout: number): Promise<ObjectId> {
    const db = await connect();
    const promise = db.db(dbName).collection<Pool>('pools').insertOne(pool);
    const result = await executeWithTimeout(promise, timeout);
    return result.insertedId;
}


// Get a pool by caption
export async function getPoolWithCaption(
    caption: string[]
): Promise<Pool | null> {
    const db = await connect();
    return db.db(dbName).collection<Pool>('pools').findOne({caption});
}

// Get a pool by caption
export async function getPools(
): Promise<Pool[] | null> {
    const db = await connect();
    return db.db(dbName).collection<Pool>('pools').find().toArray();
}

//update user states
export async function deletePoolsCollection(): Promise<void> {
    const db = await connect();
    await db
        .db(dbName)
        .collection<Pool>('pools')
        .drop();
}
// // Example usage
// export async function main() {
//     // Retrieve a user by Telegram ID with ordering data
//     const userWithOrderingData = await getUserByTelegramIDWithOrderingData('123456789');
//     console.log('User with ordering data:', userWithOrderingData);
// }

