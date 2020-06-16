import { BeforeInsert, Column, CreateDateColumn, ManyToOne, OneToMany, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn, PrimaryColumn } from 'typeorm';
import { Attributes } from './Attributes';
import { AttributeSet } from './AttributeSet';
@Entity()

export class AttributeSetRelations {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', width: 11, nullable: false })
  attribute_id: number;

  @Column({ type: 'int', width: 11, nullable: false })
  attribute_set_id: number;

  @ManyToOne(type => Attributes)
  @JoinColumn({ name: 'attribute_id' })
  attributes: Attributes;

  @ManyToOne(type => AttributeSet)
  @JoinColumn({ name: 'attribute_set_id' })
  attribute_sets: AttributeSet;

}