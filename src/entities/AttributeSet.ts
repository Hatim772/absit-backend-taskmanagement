import { BeforeInsert, Column, CreateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn, PrimaryColumn } from 'typeorm';
import { AttributeSetRelations } from './AttribteSetRelations';
import { ProductAttributeSet } from './ProductAttributeSet';
import { ProductAttributes } from './ProductAttributes';
import { AttributeSetCategoryRelations } from './AttributeSetCategoryRelations';

@Entity()

export class AttributeSet {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 170, unique: true })
  slug: string;

  // @Column({ type: 'enum', enum: ['0', '1'], comment: '(0 -Inactive, 1-Active)', default: '1' })
  // status: string;

  @Column({ type: 'enum', enum: ['0', '1'], comment: '(0- Yes, 1- No)', default: '0' })
  is_deleted: number;

  @CreateDateColumn()
  createdDate: Date;

  @OneToMany(type => AttributeSetRelations, attribute_set_relation => attribute_set_relation.attribute_sets)
  attribute_set_relation: AttributeSetRelations[];

  @OneToMany(type => ProductAttributeSet, attribute_sets => attribute_sets.product_attribute_sets)
  attribute_sets: ProductAttributeSet[];

  @OneToMany(type => ProductAttributes, product_attribute => product_attribute.attribute_set)
  product_attribute: ProductAttributes[];

  @OneToMany(type => AttributeSetCategoryRelations, attribute_set_categories => attribute_set_categories.attribute_sets)
  attribute_set_categories: AttributeSetCategoryRelations[];
}