import { Column, CreateDateColumn, ManyToOne, JoinColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Orders } from './Orders';

@Entity()
export class OrderTransactions {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int', width: 9 })
    order_id: number;

    @Column({ type: 'varchar', width: 255 })
    transaction_id: number;

    @Column({ type: 'enum', enum: ['0', '1'], comment: '(0: No, 1: Yes)', default: '0' })
    by_admin: string;

    @CreateDateColumn()
    createdDate: Date;

    @ManyToOne(type => Orders)
    @JoinColumn({ name: 'order_id' })
    order: Orders;
}