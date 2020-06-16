export interface LeftJoinArrayEl {
    joiningColumn: string,
    aliasForJoinedColumn: string
}
export interface LeftJoinConfig {
    entity: string,
    alias: string,
    whereCondition: string,
    whereConditionParams: any,
    getOne?: boolean,
    getCount?: boolean,
    getLeftJoinCount?: boolean
}
export interface LeftJoinOptions {
    select?: Array<string>
}