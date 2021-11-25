export function foo (){
    try { 
        const meta = this.meta();
        // const { event, team, user } = this.props;
        const b = team ? event.user : user;
    
        if (meta && meta.p1) {
          return meta.p1;
        } else if (meta && meta.p2) {
          return meta.p2;
        } else if (meta && meta.p3) {
          return meta.p3;
        }
    
        return b.p4 === u.u ? 'You' : b.u;
      } catch (e) {
        return 'You';
      }
}