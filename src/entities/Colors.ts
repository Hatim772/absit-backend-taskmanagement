import { Entity, Column, PrimaryGeneratedColumn, OneToMany} from 'typeorm';
import { MoodboardItems } from './MoodboardItems';
@Entity()
export class Colors {
    @PrimaryGeneratedColumn()
    id: number;

	@Column({type: 'varchar', width: 20})
    color: string;
    
    @OneToMany(type => MoodboardItems, item => item.color)
	item: MoodboardItems[];
}