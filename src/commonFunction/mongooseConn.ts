import mongoose from 'mongoose';

// third parties
import config from '../config/config';

export default async function mongoConnection(): Promise<any> {
    try {
        const conn = await mongoose.connect(config.mongooseConfig.url, { useNewUrlParser: true });
        return Promise.resolve();
    } catch (error) {
        return Promise.reject(error);
    }
}