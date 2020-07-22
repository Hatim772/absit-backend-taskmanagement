import { Column, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Index, ManyToOne } from 'typeorm';
import { Users } from './Users';
import { type } from 'os';


@Entity()
export class ClientProductDetails {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int', width: 11 })
    user_id: number;

    @Column({ type: 'varchar', length: 255, nullable: true })
    product_name: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    product_pic: string;

    @Column({ type: 'int', width: 11, nullable: true})
    price : string;

    
    @Column({ type: 'varchar', length: 255, nullable: true })
    categoery: string;

    @ManyToOne(type => Users, user =>  user.clientProductDetails)
    @JoinColumn({ name: 'user_id'})
    user: Users;

}