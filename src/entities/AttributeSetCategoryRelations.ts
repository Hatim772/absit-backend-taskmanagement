import { BeforeInsert, Column, CreateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn, PrimaryColumn } from 'typeorm';
import { Attributes } from './Attributes';
import { AttributeSet } from './AttributeSet';
import { Categories } from './Categories';
@Entity()

export class AttributeSetCategoryRelations {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', width: 11})
  attribute_set_id: number;

  @Column({ type: 'int', width: 11})
  category_id: number;

  @ManyToOne(type => Categories)
  @JoinColumn({ name: 'category_id' })
  categories: Categories;

  @ManyToOne(type => AttributeSet)
  @JoinColumn({ name: 'attribute_set_id' })
  attribute_sets: AttributeSet;
}