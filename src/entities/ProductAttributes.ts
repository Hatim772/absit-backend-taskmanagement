import { BeforeInsert, Column, CreateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn, PrimaryColumn } from 'typeorm';
import { Attributes } from './Attributes';
import { Products } from './Products';
import { AttributeValues } from './AttributeValue';
import { AttributeSet } from './AttributeSet';
import { AttributeTitles } from './AttributeTitles';
@Entity()
export class ProductAttributes {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', width: 11, nullable: false })
  attribute_id: number;

  @Column({ type: 'int', width: 11, nullable: false })
  product_id: number;

  @Column({ type: 'int', width: 11, nullable: true })
  attribute_value_id: number;

  @Column({ type: 'int', width: 11, nullable: true })
  attribute_set_id: number;

  @Column({ type: 'varchar', width: 200, nullable: true })
  value: string;

  @Column({ type: 'int', width: 11, nullable: true })
  attribute_title_id: number;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn()
  updatedDate: Date;

  @ManyToOne(type => Attributes)
  @JoinColumn({ name: 'attribute_id' })
  attributes: Attributes;

  @ManyToOne(type => Products)
  @JoinColumn({ name: 'product_id' })
  products: Products;

  @ManyToOne(type => AttributeValues)
  @JoinColumn({ name: 'attribute_value_id' })
  attribute_value: AttributeValues;

  @ManyToOne(type => AttributeSet)
  @JoinColumn({ name: 'attribute_set_id' })
  attribute_set: AttributeSet;

  @ManyToOne(type => AttributeTitles)
  @JoinColumn({ name: 'attribute_title_id' })
  attribute_titles: AttributeTitles;

}