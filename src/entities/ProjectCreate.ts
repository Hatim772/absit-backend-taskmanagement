import { Column, OneToOne, JoinColumn, Entity,ManyToMany, PrimaryGeneratedColumn, Index, OneToMany } from 'typeorm';
import { Users } from './Users';
import { ClientBrief } from './ClientBrief';
import { Task } from "./Task";
import { type } from 'os';

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

  @OneToOne(type => ClientBrief, clientBrief => clientBrief.projectCreate)
  clientBrief: ClientBrief;

  @OneToMany(type => Task, task => task.project)
  task : Task;
    

  // @OneToOne(type => Users)
  @JoinColumn({ name: 'user_id' })
  user: Users;
}