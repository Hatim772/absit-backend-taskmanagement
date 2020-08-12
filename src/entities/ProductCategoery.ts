import { BeforeInsert, Column, CreateDateColumn, ManyToMany,ManyToOne, OneToMany, JoinColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Index, OneToOne } from 'typeorm';
import { Users } from './Users';
@Entity()

export class ProductCategoery {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int', width: 11 })
    user_id: number;

    @Column({type:'text'})
    categoery : string;
}
