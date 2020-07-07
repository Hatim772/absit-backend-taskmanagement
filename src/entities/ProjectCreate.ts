import { Column, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';
import { Users } from './Users';
@Entity()

  export class ProjectCreateDetails {
  @PrimaryGeneratedColumn()
  id: number;


  @Column({ type: 'int', width: 11 })
  user_id: number;


  @Column({ type: 'varchar', length: 255, nullable: true })
  project_name: string;


  @Column({ type: 'varchar', length: 255, nullable: true })
  project_image: string;

  // @OneToOne(type => Users)
  @JoinColumn({ name: 'user_id' })
  user: Users;
}