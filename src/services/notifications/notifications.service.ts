// third parties
import _ from 'lodash';
// models
import Notifications, { INotifications } from '../../models/Notifications';
import { ObjectID } from 'bson';

// local interfaces

interface I_Notification {
    to: Array<any>,
    message: string,
    isRead?: Array<number>,
    url?: string,
    _createdDate?: Date,
    read?: any,
}


export default class NotificationsService {
    constructor() { }

    /**
     * used for inserting notification
     * @param data 
     */
    async insert(data: I_Notification[] | I_Notification): Promise<any> {
        try {
            // insert notifications
            const inserted = await Notifications.insertMany(data);
            return Promise.resolve(inserted);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    /**
     * used for getting all read / unread notification 
     * for specified user
     * @param to 
     * @param read 
     */
    async getNotifications(to: number, isRead?: boolean): Promise<any> {
        try {
            let condition: any = { to: { $in: [to] } };
            if (isRead) condition.isRead = isRead;

            let notifications: any = await Notifications.find(condition).sort({ _createdDate: -1 });
            if (notifications.length) {
                notifications = JSON.parse(JSON.stringify(notifications));
                notifications.map((value: any) => {
                    const val = value.to.indexOf(to);
                    value['isRead'] = value.isRead[val];
                });
            }
            return Promise.resolve(notifications);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    /**
     * used for getting all read / unread notification 
     * for specified user
     * @param to 
     * @param read 
     */
    async getUnreadNotifications(to: number, isRead?: boolean | number): Promise<any> {
        try {
            let condition: any = { to: { $in: [to] } };
            if (isRead) condition.isRead = [Number(isRead)];
            console.log('condition', condition);
            let notifications: any = await Notifications.count(condition);

            return Promise.resolve(notifications);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    /**
     * Used for updating notification
     * to read from unread
     * @param notification_id
     */
    async updateNotification(notification_id: string): Promise<any> {
        try {
            const updatedNotification = await Notifications.updateOne(
                { _id: new ObjectID(notification_id) },
                {
                    $set: {
                        isRead: 1
                    }
                });
            return Promise.resolve();
        } catch (error) {
            return Promise.reject(error);
        }
    }

    /**
     * Used to delete only read notification
     * @param notification_id 
     */
    async deleteNotification(notification_id: string): Promise<any> {
        try {
            const result = await Notifications.deleteOne({
                _id: new ObjectID(notification_id),
                isRead: 1
            });
            return Promise.resolve(result);
        } catch (error) {
            return Promise.reject(error);
        }
    }

}