import { BeforeInsert, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Index, OneToOne } from 'typeorm';
import { Users } from './Users';
import { ProjectCreateDetails } from "./ProjectCreate";
@Entity()

export class Task {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int', width: 11 })
    user_id: number;

    @Column({ type: 'int', width: 11 })
    project_id: number;

    @Column({type:'text'})
    status : string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    task_name: string;

    @Column({ type: 'date', nullable: true })
    taskCompletedate: Date;
    
    @JoinColumn({ name: 'user_id' , referencedColumnName: 'id'})
    user: Users;

    @ManyToOne(type => ProjectCreateDetails)
    @JoinColumn({ name: 'project_id', referencedColumnName: 'id' })
    project: ProjectCreateDetails;
}
