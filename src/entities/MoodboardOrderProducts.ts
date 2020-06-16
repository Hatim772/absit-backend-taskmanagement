import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Moodboard } from './Moodboard';
import { Products } from './Products';
import { MoodboardOrders } from './MoodboardOrders';
@Entity()
export class MoodboardOrderProducts {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int', width: 11 })
    product_id: number;
    
    @Column({ type: 'int', width: 11 })
    moodboard_id: number;

    @Column({ type: 'int', width: 11, nullable: true })
    moodboard_order_id: number;

    @ManyToOne(type => Products)
    @JoinColumn({name: 'product_id'})
    product: Products;

    @ManyToOne(type => Moodboard)
    @JoinColumn({name: 'moodboard_id'})
    moodboard: Moodboard;

    @ManyToOne(type => MoodboardOrders)
    @JoinColumn({name: 'moodboard_order_id'})
    moodboardOrders: MoodboardOrders;
}
