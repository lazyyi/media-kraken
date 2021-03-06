import Soukai, { Attributes } from 'soukai';
import { openDB, IDBPDatabase, DBSchema, deleteDB } from 'idb';
import { SolidModel, SolidDocument } from 'soukai-solid';

interface CachedDocumentData {
    updatedAt: Date;
    models: Record<string, CachedModel>;
}

interface CachedModel {
    modelName: string;
    attributes: Attributes;
    relationModelNames: Record<string, string>;
    relationAttributes:  Record<string, Attributes[]>;
}

interface DatabaseSchema extends DBSchema {
    'models-cache': {
        value: CachedDocumentData;
        key: string;
    };
}

class ModelsCache {

    private connection?: IDBPDatabase<DatabaseSchema>;

    public async getFromDocument(document: SolidDocument, validAge: number = 0): Promise<SolidModel[] | null> {
        const data = await this.getDocumentData(document.url);

        if (!data || Math.abs(document.updatedAt.getTime() - data.updatedAt.getTime()) > validAge)
            return null;

        return this.deserializeModels(data);
    }

    public async rememberDocument(documentUrl: string, documentUpdatedAt: Date): Promise<void> {
        await this.setDocumentData(documentUrl, {
            models: {},
            updatedAt: documentUpdatedAt,
        });
    }

    public async remember(model: SolidModel, relatedModels: Record<string, SolidModel[]> = {}): Promise<void> {
        const documentUrl = model.getDocumentUrl();

        if (!documentUrl)
            throw new Error('Cannot remember a model without url');

        const data = await this.getDocumentData(documentUrl);

        if (!data)
            throw Error(`Model document not initialized: ${documentUrl}`);

        data.models[model.url] = this.serializeModel(model, relatedModels);

        await this.setDocumentData(documentUrl, data);
    }

    public async forgetDocument(url: string): Promise<void> {
        await this.deleteDocumentData(url);
    }

    public async clear(): Promise<void> {
        if (this.connection) {
            this.connection.close();
            delete this.connection;
        }

        await deleteDB('media-kraken');
    }

    private async getDocumentData(url: string): Promise<CachedDocumentData | null> {
        try {
            const connection = await this.getConnection();
            const transaction = connection.transaction('models-cache', 'readonly');

            return await transaction.store.get(url) || null;
        } catch (e) {
            return null;
        }
    }

    private async setDocumentData(url: string, data: CachedDocumentData): Promise<void> {
        const connection = await this.getConnection();
        const transaction = connection.transaction('models-cache', 'readwrite');

        transaction.store.put(data, url);

        await transaction.done;
    }

    private async deleteDocumentData(url: string): Promise<void> {
        const connection = await this.getConnection();
        const transaction = connection.transaction('models-cache', 'readwrite');

        transaction.store.delete(url);

        await transaction.done;
    }

    private serializeModel(model: SolidModel, relatedModels: Record<string, SolidModel[]>): CachedModel {
        return {
            modelName: model.modelClass.modelName,
            attributes: model.getAttributes(),
            relationModelNames: Object
                .keys(relatedModels)
                .reduce((relationModelNames, relation) => {
                    relationModelNames[relation] = model.getRelation(relation)!.relatedClass.modelName;

                    return relationModelNames;
                }, {} as Record<string, string>),
            relationAttributes: Object
                .entries(relatedModels)
                .reduce((relationAttributes, [relation, models]) => {
                    relationAttributes[relation] = models.map(model => model.getAttributes());

                    return relationAttributes;
                }, {} as Record<string, Attributes[]>),
        };
    }

    private deserializeModels(data: CachedDocumentData): SolidModel[] {
        return Object.values(data.models).map(modelData => this.deserializeModel(modelData));
    }

    private deserializeModel(data: CachedModel): SolidModel {
        const modelClass = Soukai.model(data.modelName) as typeof SolidModel;
        const model = modelClass.newInstance(data.attributes, true);

        for (const [relation, relatedModelsAttributes] of Object.entries(data.relationAttributes)) {
            model.setRelationModels(
                relation,
                relatedModelsAttributes.map(attributes => {
                    const relatedModelClass = Soukai.model(data.relationModelNames[relation]) as typeof SolidModel;

                    return relatedModelClass.newInstance(attributes, true);
                }),
            );
        }

        return model;
    }

    private async getConnection(): Promise<IDBPDatabase<DatabaseSchema>> {
        if (!this.connection)
            this.connection = await openDB('media-kraken', 1, {
                upgrade(db) {
                    db.createObjectStore('models-cache');
                },
            });

        return this.connection;
    }

}

export default new ModelsCache();
