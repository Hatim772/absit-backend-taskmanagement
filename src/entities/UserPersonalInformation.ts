import { Column, OneToOne, JoinColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Users } from './Users';
@Entity()
export class UserPersonalInformation {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', width: 150, nullable: true })
    about: string;

    @Column({ type: 'varchar', width: 150, nullable: true })
    facebookProfile: string;

    @Column({ type: 'varchar', width: 150, nullable: true })
    linkedinProfile: string;

    @Column({ type: 'varchar', width: 150, nullable: true })
    instagramProfile: string;

    @Column({ type: 'varchar', width: 150, nullable: true })
    twitterProfile: string;

    @Column({ type: 'varchar', width: 150, nullable: true })
    pinterestProfile: string;

    @Column({ type: 'int', width: 11 })
    user_id: number;

    @OneToOne(type => Users)
    @JoinColumn({ name: 'user_id' })
    user: Users;
}