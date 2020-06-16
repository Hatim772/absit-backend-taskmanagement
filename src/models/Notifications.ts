import mongoose, { Schema, Document } from 'mongoose';

/**
 * INotifications interface is used
 * as schema.
 */
export interface INotifications extends Document {

    to: Array<any>,
    message: string,
    isRead?: Array<number>,
    url?: string,
    _createdDate?: Date,
}

// Create schema
const NotificationsSchema: Schema = new Schema({
    to: { type: Array, required: true },
    message: { type: String, required: true },
    isRead: { type: Array, required: true, default: 0 },
    url: { type: String, required: false },
    _createdDate: { type: Date, default: new Date(), required: false }
});

// Export the model and return INotifications interface
export default mongoose.model<INotifications>('Notifications', NotificationsSchema);
