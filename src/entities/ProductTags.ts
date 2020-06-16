import { BeforeInsert, Column, CreateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn, PrimaryColumn } from 'typeorm';
import { Products } from './Products';
import { Tags } from './Tags';
@Entity()

export class ProductTags {

	@PrimaryGeneratedColumn()
	id: number;

	@Column({ type: 'int', width: 11, nullable: false })
	product_id: number;

	@Column({ type: 'int', width: 11, nullable: false })
	tag_id: number;

	@ManyToOne(type => Tags)
	@JoinColumn({ name: 'tag_id' })
	tags: Tags;

	@ManyToOne(type => Products)
	@JoinColumn({ name: 'product_id' })
	products: Products;

}