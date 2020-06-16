import { BeforeInsert, Column, CreateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn, PrimaryColumn } from 'typeorm';
import { AttributeSet } from './AttributeSet';
import { Products } from './Products';

@Entity()

export class ProductAttributeSet {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', width: 11, nullable: false })
  attribute_set_id: number;

  @Column({ type: 'int', width: 11, nullable: false })
  product_id: number;

  @ManyToOne(type => AttributeSet)
  @JoinColumn({ name: 'attribute_set_id' })
  product_attribute_sets: AttributeSet;

  @ManyToOne(type => Products)
  @JoinColumn({ name: 'product_id' })
  products: Products;

}