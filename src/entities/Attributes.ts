import { BeforeInsert, Column, CreateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn, PrimaryColumn } from 'typeorm';
import { AttributeSetRelations } from './AttribteSetRelations';
import { ProductAttributes } from './ProductAttributes';
import { AttributeValues } from './AttributeValue';
import { AttributeTitles } from './AttributeTitles';

@Entity()
export class Attributes {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 170, unique: true })
  slug: string;

  @Column({ type: 'enum', enum: ['1', '2'], comment: '(1- DropDown, 2- Text box)' })
  type: string;

  @Column({ type: 'enum', enum: ['0', '1'], comment: '(0- Yes, 1- No)' })
  is_searchable: string;

  @Column({ type: 'int', width: 11 })
  attribute_title_id: number;

  // @Column({ type: 'enum', enum: ['0', '1'], comment: '(0- InActive, 1- Active)', default: '1' })
  // status: string;

  @Column({ type: 'enum', enum: ['0', '1'], comment: '(0- Yes, 1- No)', default: '0' })
  is_deleted: string;

  @CreateDateColumn()
  createdDate: Date;

  @Column({ type: 'enum', enum: ['0', '1'], comment: '(1- Yes, 0- No)', default: '0' })
  is_discoverable: string;

  @OneToMany(type => AttributeSetRelations, attribute_set_relation => attribute_set_relation.attributes)
  attribute_set_relation: AttributeSetRelations[];

  @OneToMany(type => ProductAttributes, product_attribute => product_attribute.attributes)
  product_attribute: ProductAttributes[];

  @OneToMany(type => AttributeValues, attribute_value => attribute_value.attributes)
  attribute_value: AttributeValues[];

  @ManyToOne(type => AttributeTitles)
  @JoinColumn({ name: 'attribute_title_id' })
  attribute_titles: AttributeTitles;

}