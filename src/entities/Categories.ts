import { BeforeInsert, Column, Tree, TreeParent, TreeChildren, CreateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn, PrimaryColumn } from 'typeorm';
import { ProductCategories } from './ProductCategories';
import { AttributeSetCategoryRelations } from './AttributeSetCategoryRelations';

@Entity()
@Tree('materialized-path')

export class Categories {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 170, default: false, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 170, default: null })
  category_image: string;

  @Column({ type: 'int', width: 11, default: 0 })
  max_single_cat_products: number;

  @Column({ type: 'int', width: 11, default: 0 })
  max_multiple_cat_products: number;

  @Column({ type: 'enum', enum: ['0', '1'], comment: '(0- Yes, 1- No)', default: '0' })
  is_deleted: string;

  @TreeChildren()
  children: Categories[];

  @TreeParent()
  parent: Categories;

  // @Column({ type: 'enum', enum: ['0', '1'], comment: '(0- InActive, 1- Active)', default: '1' })
  // status: string;

  @OneToMany(type => ProductCategories, product_category => product_category.categories)
  product_category: ProductCategories[];

  @OneToMany(type => AttributeSetCategoryRelations, attribute_set_categories => attribute_set_categories.categories)
  attribute_set_categories: AttributeSetCategoryRelations[];
}