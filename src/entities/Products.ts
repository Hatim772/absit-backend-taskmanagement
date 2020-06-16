import { Column, CreateDateColumn, OneToMany, OneToOne, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ProductAttributeSet } from './ProductAttributeSet';
import { ProductTags } from './ProductTags';
import { ProductCategories } from './ProductCategories';
import { ProductAttributes } from './ProductAttributes';
import { OrdersReference } from './OrdersReference';
import { ProductFaq } from './ProductFaq';
import { RequestForPricing } from './RequestForPricing';
import { MoodboardItems } from './MoodboardItems';
import { ComplementryProducts } from './ComplementryProducts';

@Entity()
export class Products {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', width: 150 })
  name: string;

  // @Column({ type: 'text', default: null })
  // description: string;

  @Column({ type: 'varchar', width: 170, default: null })
  feature_image: string;

  // remove it when you've got time to remove slug property from each files
  // @Column({ type: 'varchar', width: 170, nullable: true })
  // slug: string;

  @Column({ type: 'text', default: null })
  slider_images: string;

  @Column({ type: 'int' })
  price: number;

  // @Column({ type: 'int' })
  // max_price: number;

  @Column({ type: 'enum', enum: ['0', '1'], comment: '(0-no, 1-yes)', default: '0' })
  is_deleted: string;

  // @Index('sku_IDX', { unique: true })
  @Column({ type: 'varchar', width: 170, nullable: true, unique: true })
  sku: string;

  @Column({ type: 'varchar', width: 170, nullable: true})
  old_sku: string;

  @Column({ type: 'varchar', width: 170, nullable: true })
  company_code: string;

  @Column({ type: 'int', width: 9, nullable: true })
  dealer_price: number;

  @Column({ type: 'int', width: 9, nullable: true })
  retailer_price: number;

  @CreateDateColumn()
  createdDate: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedDate: Date;

  @OneToMany(type => ProductAttributeSet, attribute_sets => attribute_sets.products)
  attribute_sets: ProductAttributeSet[];

  @OneToMany(type => ProductTags, tags_sets => tags_sets.products)
  tags_sets: ProductTags[];

  @OneToOne(type => ProductCategories, product_category => product_category.products)
  product_category: ProductCategories;

  @OneToMany(type => ProductAttributes, product_attribute => product_attribute.products)
  product_attribute: ProductAttributes[];

  @OneToMany(type => MoodboardItems, item => item.product)
  item: MoodboardItems[];

  @OneToMany(type => OrdersReference, orderRef => orderRef.product)
  orderRef: OrdersReference[];

  @OneToMany(type => ProductFaq, products => products.products)
  productsFaq: ProductFaq[];

  @OneToMany(type => RequestForPricing, requestForPricing => requestForPricing.product)
  requestForPricing: RequestForPricing[];

  // @OneToMany(type => ComplementryProducts, complementryProducts => complementryProducts.product_sku)
  // complementryProducts: ComplementryProducts[];
}