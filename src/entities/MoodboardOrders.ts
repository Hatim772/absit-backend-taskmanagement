import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, OneToMany, JoinColumn, ManyToOne, Generated, BeforeInsert } from 'typeorm';
import { Moodboard } from './Moodboard';
import { Users } from './Users';
import { MoodboardOrderProducts } from './MoodboardOrderProducts';
@Entity()
export class MoodboardOrders {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    // @Generated("uuid")
    order_id: string;

    @Column({ type: 'int', width: 11 })
    moodboard_id: number;

    @Column({ type: 'int', width: 11 })
    user_id: number;

    @Column({ type: 'enum', enum: ['0', '1', '2', '3'], comment: '(0-not requested, 1-requested for return date extend, 2-request completed, 3-request rejected)', default: '0' })
    request_to_extend_return_date: string;

    @Column({ type: 'timestamp', default: null })
    estimated_delivery_date: Date;

    @Column({ type: 'timestamp', default: null })
    estimated_return_date: Date;

    @Column({ type: 'enum', enum: ['1', '2', '3', '4', '5'], comment: '(1-Order processing, 2-Order is out for delivery, 3-Order delivered, 4-Order cancelled, 5-Order returned)', default: '1' })
    order_status: string;

    @CreateDateColumn()
    createdDate: Date;

    @OneToMany(type => MoodboardOrderProducts, moodboardOrderProducts => moodboardOrderProducts.moodboardOrders)
    moodboardOrderProducts: MoodboardOrderProducts[];

    @ManyToOne(type => Users)
    @JoinColumn({ name: 'user_id' })
    user: Users;

    @ManyToOne(type => Moodboard)
    @JoinColumn({ name: 'moodboard_id' })
    moodboard: Moodboard;

    @BeforeInsert()
      private beforeInsert() {
        let uuid = 'SKxxxxxx-4xxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        this.order_id = uuid;
      }
}
