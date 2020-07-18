import { BeforeInsert, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Index, OneToOne } from 'typeorm';
import { Users } from './Users';
import { ProjectCreateDetails } from "./ProjectCreate";
import { ClientDetails } from "./Client";
@Entity()

export class ClientBrief {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'int', width: 11 })
    user_id: number;

    @Column({ type: 'int', width: 11 })
    project_id: number;

    @Column({ type: 'int', width: 11 })
    client_id: number;

    @Column({ type: 'varchar', length: 255, nullable: true })
    expectation_of_project: string;

    @Column({ type: 'text'})
    budget: number;


    @Column({ type: 'text',nullable: true })
    project_image: string;

    @Column({ type: 'text',nullable: true })
    timeline: string;

    @Column({ type: 'text',nullable: true})
    question_Answer: string;
    
    @JoinColumn({ name: 'client_id' , referencedColumnName: 'id'})
    client: ClientDetails;

    @JoinColumn({ name: 'user_id' , referencedColumnName: 'id'})
    user: Users;

    // @OneToOne(type => ProjectCreateDetails)
    @JoinColumn({ name: 'project_id', referencedColumnName: 'id' })
    project: ProjectCreateDetails;
}
