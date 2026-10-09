// Synthetic shape examples. No captured responses, accounts or signed media URLs.
const videos=Array.from({length:6},(_,i)=>({series_id:String(7000000000000000000n+BigInt(i)),series_title:'协议示例 '+(i+1),episode_cnt:230,series_cover:'',sub_title_list:['测试']}));
export async function fixture(name){
 if(name==='reading-bookapi-search-tab-v')return{data:{search_tabs:[{tab_type:11,data:videos.map(video_detail=>({cell_data:[{video_data:{video_detail}}]}))},{tab_type:1,data:[{book_id:'900000',title:'非视频条目'}]}]}};
 if(name==='reading-bookapi-bookmall-tab-v')return{data:{tab_index:0,tab_item:[{tab_type:16,title:'合成推荐',cell_data:videos.map(video_detail=>({cell_type:407,video_data:{video_detail}}))}]}};
 if(name==='novel-player-video_detail-v1')return{data:{video_data:{...videos[0],video_list:Array.from({length:230},(_,i)=>({vid:String(8000000000000000000n+BigInt(i)),vid_index:i+1,disable_play:false}))}}};
 throw new Error('Unknown synthetic fixture');
}
