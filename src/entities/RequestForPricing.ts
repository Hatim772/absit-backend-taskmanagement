import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, UpdateDateColumn} from 'typeorm';
import { Products } from './Products';
import { Users } from './Users';
@Entity()
export class RequestForPricing {
	@PrimaryGeneratedColumn()
	id: number;

	@Column({ type: 'int', width: 11 })
    product_id: number;
    
    @Column({ type: 'int', width: 11 })
	user_id: number;

    @Column({ type: 'int', width: 11 })
    quantity: number;

    @Column({ type: 'int', width: 11, nullable: true })
    price: number;

    @Column({ type: 'enum', enum: ['0', '1'], comment: '(0-pending, 1-completed)', default: '0' })
	status: string;
    
	@CreateDateColumn()
    createdDate: Date;

    @UpdateDateColumn()
    updatedDate: Date;
    
    @ManyToOne(type => Products)
    @JoinColumn({name: 'product_id'})
    product: Products[];

    @ManyToOne(type => Users)
    @JoinColumn({name: 'user_id'})
    user: Users[];
}