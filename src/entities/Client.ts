import { Column, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';
import { Users } from './Users';
@Entity()

  export class ClientDetails {
  @PrimaryGeneratedColumn()
  id: number;


  @Column({ type: 'int', width: 11 })
  user_id: number;


  @Column({ type: 'varchar', length: 255, nullable: true })
  client_name: string;


  @Column({ type: 'varchar', length: 50, nullable: true })
  email: string;


  @Column({ type: 'varchar', length: 12, nullable: true })
  mobile_no: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  categeory : string;

  // @OneToOne(type => Users)
  @JoinColumn({ name: 'user_id' })
  user: Users;
}