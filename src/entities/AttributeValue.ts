import { Column, ManyToOne, OneToMany, JoinColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Attributes } from './Attributes';
import { ProductAttributes } from './ProductAttributes';
@Entity()
export class AttributeValues {
	@PrimaryGeneratedColumn()
	id: number;

	@Column({ type: 'int', width: 11, nullable: false })
	attribute_id: number;

	@Column({ type: 'varchar', width: 255, nullable: false })
	attribute_value: string;

	@ManyToOne(type => Attributes)
	@JoinColumn({ name: 'attribute_id' })
	attributes: Attributes;

	@OneToMany(type => ProductAttributes, product_attribute => product_attribute.attribute_value)
	product_attribute: ProductAttributes[];
}