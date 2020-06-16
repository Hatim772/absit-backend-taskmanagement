import { Entity, Column, PrimaryGeneratedColumn, OneToMany} from 'typeorm';
import { MoodboardItems } from './MoodboardItems';
@Entity()
export class Images {
    @PrimaryGeneratedColumn()
    id: number;

	@Column({type: 'varchar', width: 20})
    image_url: string;
    
    @OneToMany(type => MoodboardItems, item => item.image)
	item: MoodboardItems[];
}