import { BeforeInsert, Column, CreateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn, PrimaryColumn } from 'typeorm';
import { Attributes } from './Attributes';
import { ProductAttributes } from './ProductAttributes';
@Entity()

export class AttributeTitles {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', width: 255, nullable: false })
  title: string;

  @OneToMany(type => Attributes, attribute_titles => attribute_titles.attribute_titles)
  attribute_titles: Attributes[];

  @OneToMany(type => ProductAttributes, attribute_product_titles => attribute_product_titles.attribute_titles)
  attribute_product_titles: ProductAttributes[];

}