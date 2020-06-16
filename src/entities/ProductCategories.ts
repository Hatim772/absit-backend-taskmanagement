import { BeforeInsert, Column, Tree, TreeParent, TreeChildren, CreateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn, PrimaryColumn } from 'typeorm';
import { Products } from './Products';
import { Categories } from './Categories';
@Entity()
export class ProductCategories {
	@PrimaryGeneratedColumn()
	id: number;

	@Column({ type: 'int' })
	product_id: number;

	@Column({ type: 'int' })
	category_id: number;

	@ManyToOne(type => Categories)
	@JoinColumn({ name: 'category_id' })
	categories: Categories;

	@OneToOne(type => Products)
	@JoinColumn({ name: 'product_id' })
	products: Products;
}