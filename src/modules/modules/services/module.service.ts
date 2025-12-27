import { GetBrowseModulesUseCase } from '#modules/modules/use-cases'

export class ModuleService {
    private readonly getBrowseModulesUseCase: GetBrowseModulesUseCase

    constructor() {
        this.getBrowseModulesUseCase = new GetBrowseModulesUseCase()
    }

    getBrowseModules = () => {
        return this.getBrowseModulesUseCase.execute()
    }
}
