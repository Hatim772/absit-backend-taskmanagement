import { Column, OneToMany, Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { MoodboardOrders } from './MoodboardOrders';
import { Projects } from './Project';
import { Users } from './Users';

@Entity()
export class UsersShippingAddress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', width: 11 })
  user_id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address_line1: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address_line2: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  landmark: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  city: string;

  @Column({ type: 'varchar', length: 11, nullable: true })
  pin_code: string;

  @OneToMany(type => Projects, project => project.shipping_address)
  project: Projects[];

  @OneToOne(type => Users)
  @JoinColumn({name: 'user_id'})
  user: Users;
}