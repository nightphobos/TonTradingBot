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
    telegramID: string;
    walletAddress: string;
    secretKey: string;
    orderingData?: OrderingData[];
}

// MongoDB connection URI
const uri = 'mongodb+srv://dusanpracaex:6yhn7ujm8ik@cluster0.7lclbo1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0' || process.env.MONGOURI;
const dbName = 'TelegramBot';

// Connect to MongoDB
export async function connect(): Promise<MongoClient> {
    const client = new MongoClient(uri);
    await client.connect();
    return client;
}

// Create a new user
export async function createUser(user: User): Promise<ObjectId> {
    const db = await connect();
    const result = await db.db(dbName).collection<User>('users').insertOne(user);
    return result.insertedId;
}

// Get a user by Telegram ID
export async function getUserByTelegramID(telegramID: string): Promise<User | null> {
    const db = await connect();
    return db.db(dbName).collection<User>('users').findOne({ telegramID });
}

// Add ordering data to a user
export async function addOrderingDataToUser(
    telegramID: string,
    orderingData: OrderingData
): Promise<void> {
    const db = await connect();
    await db.db(dbName).collection<User>('users').updateOne({ telegramID }, { $push: { orderingData } });
}

// Delete ordering data from a user
export async function deleteOrderingDataFromUser(
    telegramID: string,
    orderingDataId: ObjectId
): Promise<void> {
    const db = await connect();
    await db.db(dbName).collection<User>('users').updateOne({ telegramID }, { $pull: { orderingData: { _id: orderingDataId } } });
}

// Get a user by Telegram ID with ordering data
export async function getUserByTelegramIDWithOrderingData(telegramID: string): Promise<User | null> {
    const db = await connect();
    return db.db(dbName).collection<User>('users').findOne({ telegramID });
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
