import { BeforeInsert, Column, CreateDateColumn, ManyToMany,ManyToOne, OneToMany, JoinColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Index, OneToOne } from 'typeorm';
import { Users } from './Users';
import { ProjectCreateDetails } from "./ProjectCreate";
import { ClientDetails } from "./Client";

@Entity()

export class ProjectClientAssignment {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int', width: 11 })
    user_id: number;

    @Column({ type: 'int', width: 11 })
    project_id: number;

    @Column({ type: 'int', width: 11 })
    client_id: number;

    @JoinColumn({ name: 'client_id' , referencedColumnName: 'id'})
    client: ClientDetails;

    // @OneToOne(type => ProjectCreateDetails, projectCreate => projectCreate.clientBrief)
    @JoinColumn({ name: 'project_id'})
    projectCreate: ProjectCreateDetails;

    @JoinColumn({ name: 'user_id' , referencedColumnName: 'id'})
    user: Users;
}
