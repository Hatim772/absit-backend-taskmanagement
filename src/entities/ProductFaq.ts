import { BeforeInsert, Column, CreateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn, PrimaryColumn } from 'typeorm';
import { Products } from './Products';
import { Users } from './Users';

@Entity()
export class ProductFaq {

	@PrimaryGeneratedColumn()
	id: number;

	@Column({ type: 'text', nullable: true })
	question: string;

	@Column({ type: 'text', nullable: true })
	answer: string;

	@Column({ type: 'int', width: 11, nullable: true })
	asked_by: number;

	@Column({ type: 'int', width: 11, nullable: true })
	answer_by: number;

	@Column({ type: 'int', width: 11, nullable: true })
	product_id: number;

	@Column({ type: 'enum', enum: ['0', '1', '2'], comment: '(0 - Pending,1-Complete,2-Invalid)' })
	status: string;

	@CreateDateColumn()
	createdDate: Date;

	@UpdateDateColumn()
	updatedDate: Date;

	@ManyToOne(type => Products)
	@JoinColumn({ name: 'product_id' })
	products: Products;

	@ManyToOne(type => Users)
	@JoinColumn({ name: 'asked_by' })
	creator: Users;

	@ManyToOne(type => Users)
	@JoinColumn({ name: 'answer_by' })
	answerer: Users;

}