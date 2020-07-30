import { BeforeInsert, Column, CreateDateColumn, ManyToMany,ManyToOne, OneToMany, JoinColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Index, OneToOne } from 'typeorm';
import { Users } from './Users';
import { Task } from './Task';
import { ProjectCreateDetails } from "./ProjectCreate";
@Entity()

export class TaskComment {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int', width: 11 })
    user_id: number;

    @Column({ type: 'int', width: 11 })
    task_id: number;

    @Column({type:'text',nullable: true })
    comment : string;

    @Column({type:'text',nullable: true })
    attachments : string;

    @JoinColumn({ name: 'user_id' , referencedColumnName: 'id'})
    user: Users;

    @OneToMany(type => Task, project => project.taskComment)
    @JoinColumn({ name: 'task_id',referencedColumnName : "id"})
    taskComment: Task; 


}
