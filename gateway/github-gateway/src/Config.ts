export class Config {
  private static _instance: Config = new Config()
  private constructor(){

  }
  public static get instance(){
    return this._instance;
  }
}